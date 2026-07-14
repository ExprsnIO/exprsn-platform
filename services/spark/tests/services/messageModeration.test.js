/**
 * FEAT-009 — spark text-moderation invariant + sink (DB-free unit tests).
 *
 * Mocks the model layer and the shared UGC queue so these run without Postgres/
 * Redis. Run:  cd services/spark && npx jest tests/services/messageModeration.test.js
 */

'use strict';

// ── Mock spark's model layer (both modules under test require it lazily). ──
const mockMessageModeration = {
  create: jest.fn().mockResolvedValue({}),
  upsert: jest.fn().mockResolvedValue([{}, true]),
  findOne: jest.fn(),
  update: jest.fn(),
  findAll: jest.fn(),
  sequelize: { literal: (s) => ({ __literal: s }) },
};
const mockMessage = {
  findByPk: jest.fn(),
};
jest.mock('../../src/models', () => ({
  MessageModeration: mockMessageModeration,
  Message: mockMessage,
}));

// ── Mock the moderator's shared UGC queue (downward in-process require). ──
const submitForModeration = jest.fn().mockResolvedValue(true);
jest.mock('../../../moderator/src/queues/ugcModeration', () => ({ submitForModeration }));

const mm = require('../../src/services/messageModeration');
const sink = require('../../src/services/moderationSink');

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks drops mockResolvedValue implementations in this jest version —
  // re-establish the defaults the tests rely on.
  submitForModeration.mockResolvedValue(true);
  mockMessageModeration.create.mockResolvedValue({});
  mockMessageModeration.upsert.mockResolvedValue([{}, true]);
  delete process.env.SPARK_TEXT_MODERATION;
});

describe('initialState (DM policy / feature gate)', () => {
  test('feature OFF ⇒ skipped/feature_disabled', () => {
    expect(mm.initialState({ content: 'hello' })).toEqual({ status: 'skipped', reason: 'feature_disabled' });
  });

  test('encrypted (content null) ⇒ skipped/encrypted — ciphertext never scored', () => {
    process.env.SPARK_TEXT_MODERATION = 'true';
    expect(mm.initialState({ encrypted: true, content: null })).toEqual({ status: 'skipped', reason: 'encrypted' });
  });

  test('encrypted flag with residual content ⇒ still skipped/encrypted', () => {
    process.env.SPARK_TEXT_MODERATION = 'true';
    expect(mm.initialState({ encrypted: true, content: 'x' })).toEqual({ status: 'skipped', reason: 'encrypted' });
  });

  test('empty/whitespace plaintext ⇒ skipped/no_text', () => {
    process.env.SPARK_TEXT_MODERATION = 'true';
    expect(mm.initialState({ content: '   ' })).toEqual({ status: 'skipped', reason: 'no_text' });
  });

  test('plaintext group/channel message ⇒ pending (scanned)', () => {
    process.env.SPARK_TEXT_MODERATION = 'true';
    expect(mm.initialState({ content: 'be nice' })).toEqual({ status: 'pending', reason: null });
  });
});

describe('hashContent', () => {
  test('deterministic sha256 hex, null-safe', () => {
    expect(mm.hashContent('abc')).toBe(mm.hashContent('abc'));
    expect(mm.hashContent(null)).toHaveLength(64);
    expect(mm.hashContent('abc')).not.toBe(mm.hashContent('abd'));
  });
});

describe('moderateMessage', () => {
  const msg = { id: 'm1', conversationId: 'c1', senderId: 'u1', content: 'hi there' };

  test('E2EE DM (encrypted) ⇒ row skipped, NOTHING enqueued (report-only)', async () => {
    process.env.SPARK_TEXT_MODERATION = 'true';
    const res = await mm.moderateMessage({ ...msg, encrypted: true, content: null });
    expect(res.status).toBe('skipped');
    expect(mockMessageModeration.create).toHaveBeenCalledTimes(1);
    expect(submitForModeration).not.toHaveBeenCalled();
  });

  test('plaintext + feature on ⇒ row pending FIRST, then enqueue', async () => {
    process.env.SPARK_TEXT_MODERATION = 'true';
    const res = await mm.moderateMessage(msg);
    expect(res.status).toBe('pending');
    expect(mockMessageModeration.create).toHaveBeenCalledTimes(1);
    expect(submitForModeration).toHaveBeenCalledTimes(1);
    const payload = submitForModeration.mock.calls[0][0];
    expect(payload).toMatchObject({
      sourceService: 'spark', contentType: 'message', contentId: 'm1', userId: 'u1', mode: 'create',
    });
    // same hash on the row and the job (compare-and-set token)
    expect(payload.contentHash).toBe(mm.hashContent('hi there'));
  });

  test('edit ⇒ mode:reset upserts and enqueues reset', async () => {
    process.env.SPARK_TEXT_MODERATION = 'true';
    await mm.moderateMessage({ ...msg, content: 'edited' }, { mode: 'reset' });
    expect(mockMessageModeration.upsert).toHaveBeenCalledTimes(1);
    expect(submitForModeration.mock.calls[0][0].mode).toBe('reset');
  });

  test('feature off ⇒ skipped row, no enqueue (behaves as before)', async () => {
    const res = await mm.moderateMessage(msg);
    expect(res.status).toBe('skipped');
    expect(submitForModeration).not.toHaveBeenCalled();
  });

  test('never throws into the caller even if the row write fails (fail-open)', async () => {
    process.env.SPARK_TEXT_MODERATION = 'true';
    mockMessageModeration.create.mockRejectedValueOnce(new Error('db down'));
    const res = await mm.moderateMessage(msg);
    expect(res.status).toBe('error');
  });
});

describe('moderationSink.applyVerdict (content-hash compare-and-set)', () => {
  test('missing row ⇒ no-op {applied:false}, nothing written (C6)', async () => {
    mockMessageModeration.findOne.mockResolvedValueOnce(null);
    const res = await sink.applyVerdict({ contentId: 'm1', status: 'approved', contentHash: 'h' });
    expect(res).toEqual({ applied: false });
    expect(mockMessageModeration.update).not.toHaveBeenCalled();
  });

  test('hash mismatch (0 rows) ⇒ superseded, wrote nothing (BUG-022)', async () => {
    mockMessageModeration.findOne.mockResolvedValueOnce({ messageId: 'm1' });
    mockMessageModeration.update.mockResolvedValueOnce([0]);
    const res = await sink.applyVerdict({ contentId: 'm1', status: 'approved', contentHash: 'stale' });
    expect(res).toEqual({ applied: false, superseded: true });
    // the WHERE carried the content_hash guard
    expect(mockMessageModeration.update.mock.calls[0][1].where).toMatchObject({ messageId: 'm1', contentHash: 'stale' });
  });

  test('approved ⇒ applied, no retraction', async () => {
    mockMessageModeration.findOne.mockResolvedValueOnce({ messageId: 'm1' });
    mockMessageModeration.update.mockResolvedValueOnce([1]);
    const res = await sink.applyVerdict({ contentId: 'm1', status: 'approved', reason: 'clean', contentHash: 'h' });
    expect(res).toEqual({ applied: true, status: 'approved' });
    expect(mockMessage.findByPk).not.toHaveBeenCalled();
  });

  test('rejected ⇒ redacts message content durably', async () => {
    mockMessageModeration.findOne.mockResolvedValueOnce({ messageId: 'm1' });
    mockMessageModeration.update.mockResolvedValueOnce([1]);
    const saved = { id: 'm1', conversationId: 'c1', content: 'bad', metadata: {}, deleted: false, save: jest.fn().mockResolvedValue(true) };
    mockMessage.findByPk.mockResolvedValueOnce(saved);
    const res = await sink.applyVerdict({ contentId: 'm1', status: 'rejected', action: 'reject', contentHash: 'h' });
    expect(res).toEqual({ applied: true, status: 'rejected' });
    expect(saved.content).toBe('[removed by moderation]');
    expect(saved.metadata.moderationRemoved).toBe(true);
    expect(saved.save).toHaveBeenCalled();
  });

  test('bumpAttempts ⇒ attempts incremented via literal', async () => {
    mockMessageModeration.findOne.mockResolvedValueOnce({ messageId: 'm1' });
    mockMessageModeration.update.mockResolvedValueOnce([1]);
    await sink.applyVerdict({ contentId: 'm1', status: 'pending', reason: 'error', bumpAttempts: true, contentHash: 'h' });
    expect(mockMessageModeration.update.mock.calls[0][0].attempts).toEqual({ __literal: '"attempts" + 1' });
  });
});
