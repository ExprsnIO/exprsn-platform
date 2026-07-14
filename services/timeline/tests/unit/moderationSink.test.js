/**
 * FEAT-009 — timeline UGC moderation sink (DB-free unit tests).
 *
 * Mocks the timeline models and the shared UGC queue so the producer invariant,
 * the compare-and-set verdict sink, the read-gate, and the reconcile source are
 * exercised without Postgres/Redis.
 */

'use strict';

// ── Mock the shared moderator UGC queue (no Bull/Redis at require time).
const submitForModeration = jest.fn().mockResolvedValue(true);
jest.mock('../../../moderator/src/queues/ugcModeration', () => ({
  hashContent: jest.fn((t) => `hash:${t == null ? '' : t}`),
  submitForModeration,
}));

// ── Mock the timeline models. Each Sequelize call is a jest.fn we assert on.
const PostModeration = {
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  findAll: jest.fn(),
};
const Post = {
  findByPk: jest.fn(),
};
const sequelize = { literal: jest.fn((s) => ({ __literal: s })), close: jest.fn() };
jest.mock('../../src/models', () => ({ PostModeration, Post, sequelize }));

const sink = require('../../src/services/moderationSink');
const ugcQueue = require('../../../moderator/src/queues/ugcModeration');

const ORIG_ENV = { ...process.env };
beforeEach(() => {
  // jest.config sets resetMocks:true, which wipes factory implementations
  // between tests — re-establish the stable defaults here.
  ugcQueue.hashContent.mockImplementation((t) => `hash:${t == null ? '' : t}`);
  submitForModeration.mockResolvedValue(true);
  sequelize.literal.mockImplementation((s) => ({ __literal: s }));
  delete process.env.TIMELINE_TEXT_MODERATION;
  delete process.env.MODERATION_HOLD_TEXT_PENDING;
  sink.setNamespace(null);
});
afterAll(() => { process.env = ORIG_ENV; });

describe('establishPostModerationState (producer invariant §4.1)', () => {
  test('feature disabled → skipped, no row written, no job enqueued', async () => {
    const state = await sink.establishPostModerationState({
      post: { id: 'p1', userId: 'u1', content: 'hi' }, mode: 'create',
    });
    expect(state).toEqual({ status: 'skipped', reason: 'feature_disabled' });
    expect(PostModeration.create).not.toHaveBeenCalled();
    expect(PostModeration.findOne).not.toHaveBeenCalled();
    expect(submitForModeration).not.toHaveBeenCalled();
  });

  test('create: PRE-CREATES the pending row FIRST, then enqueues (create mode)', async () => {
    process.env.TIMELINE_TEXT_MODERATION = 'true';
    PostModeration.findOne.mockResolvedValue(null);
    PostModeration.create.mockResolvedValue({});

    const post = { id: 'p2', userId: 'u2', content: 'hello', groupId: null };
    const state = await sink.establishPostModerationState({ post, mode: 'create' });

    expect(state).toEqual({ status: 'pending', reason: null });
    // Row created with the SAME content hash forwarded to the queue.
    expect(PostModeration.create).toHaveBeenCalledWith(expect.objectContaining({
      postId: 'p2', status: 'pending', contentHash: 'hash:hello', attempts: 0,
    }));
    expect(submitForModeration).toHaveBeenCalledWith(expect.objectContaining({
      sourceService: 'timeline', contentType: 'post', contentId: 'p2',
      contentText: 'hello', contentHash: 'hash:hello', mode: 'create',
    }));
    // Ordering: row before enqueue.
    const createOrder = PostModeration.create.mock.invocationCallOrder[0];
    const submitOrder = submitForModeration.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(submitOrder);
  });

  test('reset (edit): resets the existing row and enqueues with mode reset (BUG-016)', async () => {
    process.env.TIMELINE_TEXT_MODERATION = 'true';
    const update = jest.fn().mockResolvedValue({});
    PostModeration.findOne.mockResolvedValue({ update });

    await sink.establishPostModerationState({
      post: { id: 'p3', userId: 'u3', content: 'edited', groupId: 'g9' }, mode: 'reset',
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending', contentHash: 'hash:edited', riskScore: null, verdict: null,
      moderationItemId: null, attempts: 0,
    }));
    expect(PostModeration.create).not.toHaveBeenCalled();
    expect(submitForModeration).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'reset', contentMetadata: { groupId: 'g9' },
    }));
  });

  test('never throws / never fails the post when the row write errors', async () => {
    process.env.TIMELINE_TEXT_MODERATION = 'true';
    PostModeration.findOne.mockRejectedValue(new Error('db down'));
    const state = await sink.establishPostModerationState({
      post: { id: 'p4', userId: 'u4', content: 'x' }, mode: 'create',
    });
    expect(state.reason).toBe('establish_error');
    expect(submitForModeration).not.toHaveBeenCalled();
  });
});

describe('applyVerdict (sink contract §4.2, compare-and-set BUG-022)', () => {
  test('hash mismatch (0 rows) → superseded, writes nothing to posts', async () => {
    PostModeration.update.mockResolvedValue([0]);
    const res = await sink.applyVerdict({
      sourceService: 'timeline', contentType: 'post', contentId: 'p1',
      status: 'approved', contentHash: 'stale',
    });
    expect(res).toEqual({ applied: false, superseded: true });
    expect(Post.findByPk).not.toHaveBeenCalled();
    // CAS where clause includes the content hash.
    expect(PostModeration.update.mock.calls[0][1].where).toEqual({ postId: 'p1', contentHash: 'stale' });
  });

  test('approved → row updated, posts row untouched', async () => {
    PostModeration.update.mockResolvedValue([1]);
    const res = await sink.applyVerdict({
      contentId: 'p1', status: 'approved', reason: 'clean', action: null, contentHash: 'h',
    });
    expect(res).toEqual({ applied: true, status: 'approved' });
    expect(Post.findByPk).not.toHaveBeenCalled();
  });

  test('rejected → retract: visibility→private + metadata.moderation + socket emit', async () => {
    PostModeration.update.mockResolvedValue([1]);
    const postUpdate = jest.fn().mockResolvedValue({});
    Post.findByPk.mockResolvedValue({ id: 'p1', groupId: null, deleted: false, metadata: {}, update: postUpdate });
    const emit = jest.fn();
    const nsp = { to: jest.fn(() => ({ emit })) };
    sink.setNamespace(nsp);

    const res = await sink.applyVerdict({
      contentId: 'p1', status: 'rejected', reason: 'flagged', action: 'reject',
      riskScore: 90, contentHash: 'h',
    });

    expect(res).toEqual({ applied: true, status: 'rejected' });
    expect(postUpdate).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'private' }));
    const patch = postUpdate.mock.calls[0][0];
    expect(patch.metadata.moderation).toMatchObject({ status: 'rejected', action: 'reject', riskScore: 90 });
    expect(nsp.to).toHaveBeenCalledWith('timeline:global');
    expect(emit).toHaveBeenCalledWith('post:retracted', expect.objectContaining({ postId: 'p1' }));
  });

  test('remove action retracts even when status is not literally "rejected"', async () => {
    PostModeration.update.mockResolvedValue([1]);
    const postUpdate = jest.fn().mockResolvedValue({});
    Post.findByPk.mockResolvedValue({ id: 'p1', groupId: 'g1', deleted: false, metadata: {}, update: postUpdate });
    await sink.applyVerdict({ contentId: 'p1', status: 'approved', action: 'remove', contentHash: 'h' });
    expect(postUpdate).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'private' }));
  });

  test('bumpAttempts uses a literal increment and keeps the CAS', async () => {
    PostModeration.update.mockResolvedValue([1]);
    await sink.applyVerdict({
      contentId: 'p1', status: 'pending', reason: 'error', lastError: 'boom',
      contentHash: 'h', bumpAttempts: true,
    });
    const patch = PostModeration.update.mock.calls[0][0];
    expect(sequelize.literal).toHaveBeenCalledWith('"attempts" + 1');
    expect(patch.attempts).toEqual({ __literal: '"attempts" + 1' });
    expect(patch.lastError).toBe('boom');
  });

  test('human decision without contentHash matches on postId alone', async () => {
    PostModeration.update.mockResolvedValue([1]);
    await sink.applyVerdict({ contentId: 'p1', status: 'approved', contentHash: null });
    expect(PostModeration.update.mock.calls[0][1].where).toEqual({ postId: 'p1' });
  });
});

describe('read-gate (isServableToOthers §5b)', () => {
  test('missing row → servable (C6)', () => {
    expect(sink.isServableToOthers(null)).toBe(true);
  });
  test('rejected → never servable to others', () => {
    expect(sink.isServableToOthers({ status: 'rejected' })).toBe(false);
  });
  test('pending → servable by default, hidden only when hold flag on', () => {
    expect(sink.isServableToOthers({ status: 'pending' })).toBe(true);
    process.env.MODERATION_HOLD_TEXT_PENDING = 'true';
    expect(sink.isServableToOthers({ status: 'pending' })).toBe(false);
  });
  test('approved/skipped/failed → servable (text fail-open)', () => {
    expect(sink.isServableToOthers({ status: 'approved' })).toBe(true);
    expect(sink.isServableToOthers({ status: 'skipped' })).toBe(true);
    expect(sink.isServableToOthers({ status: 'failed' })).toBe(true);
  });
});

describe('filterServablePosts', () => {
  test('moderation not deployed → returns input unchanged, no query', async () => {
    const posts = [{ id: 'a', userId: 'u1' }];
    const out = await sink.filterServablePosts(posts, 'viewer');
    expect(out).toBe(posts);
    expect(PostModeration.findAll).not.toHaveBeenCalled();
  });

  test('rejected post hidden from others but visible to author', async () => {
    process.env.TIMELINE_TEXT_MODERATION = 'true';
    PostModeration.findAll.mockResolvedValue([{ postId: 'a', status: 'rejected' }]);
    const posts = [
      { id: 'a', userId: 'author' },   // rejected, viewer is not author
      { id: 'b', userId: 'someone' },  // no row → servable
    ];
    const asViewer = await sink.filterServablePosts(posts, 'viewer');
    expect(asViewer.map((p) => p.id)).toEqual(['b']);

    PostModeration.findAll.mockResolvedValue([{ postId: 'a', status: 'rejected' }]);
    const asAuthor = await sink.filterServablePosts(posts, 'author');
    expect(asAuthor.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('listStalePending (reconcile source §4.2 step 6)', () => {
  test('shapes pending rows into re-submittable payloads; skips deleted posts', async () => {
    PostModeration.findAll.mockResolvedValue([
      { postId: 'p1', contentHash: 'h1', post: { id: 'p1', userId: 'u1', content: 'hi', groupId: null, deleted: false } },
      { postId: 'p2', contentHash: 'h2', post: { id: 'p2', userId: 'u2', content: 'x', groupId: 'g', deleted: true } },
    ]);
    const rows = await sink.listStalePending({ graceMs: 1000, limit: 10 });
    expect(rows).toEqual([{
      sourceService: 'timeline', contentType: 'post', contentId: 'p1',
      userId: 'u1', contentText: 'hi', contentUrl: null,
      contentMetadata: { groupId: null }, contentHash: 'h1',
    }]);
  });

  test('never throws — returns [] on error', async () => {
    PostModeration.findAll.mockRejectedValue(new Error('db'));
    await expect(sink.listStalePending({})).resolves.toEqual([]);
  });
});
