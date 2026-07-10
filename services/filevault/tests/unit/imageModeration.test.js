'use strict';

/**
 * FEAT-031 — image moderation at the FileVault upload chokepoint.
 * The cortex façade is mocked; no model, DB, or Redis is involved.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

jest.mock('../../../cortex/src/client', () => ({
  isEnabled: jest.fn(() => true),
  moderateImage: jest.fn(),
  describeImage: jest.fn(),
}));

const cortex = require('../../../cortex/src/client');
const svc = require('../../src/services/imageModerationService');

const CLEAN = {
  provider: 'cortex', model: 'test-vl', riskScore: 3,
  nsfwScore: 0, violenceScore: 0, hateSpeechScore: 0, selfHarmScore: 0,
  toxicityScore: 0, spamScore: 0, sentimentScore: 50, flags: [], explanation: 'benign',
  imageMeta: { format: 'png', width: 10, height: 10, pages: 1, sampled: 1 },
};
const NASTY = { ...CLEAN, riskScore: 95, nsfwScore: 97, flags: ['nsfw'] };
const DESC = { altText: 'a cat', tags: ['cat', 'animal'], textInImage: '' };

const img = (over = {}) => ({ id: 'f1', userId: 'u1', mimetype: 'image/png', metadata: {}, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FILEVAULT_IMAGE_MODERATION = 'true';
  delete process.env.FILEVAULT_IMAGE_RISK_THRESHOLD;
});

// ---------------------------------------------------------------- gating

describe('what gets queued', () => {
  test('an image is queued and starts hidden (pending)', () => {
    expect(svc.initialState(img())).toEqual({ status: 'pending', reason: null });
    expect(svc.shouldQueue(img())).toBe(true);
  });

  test('a non-image is skipped without decoding', () => {
    const pdf = img({ mimetype: 'application/pdf' });
    expect(svc.initialState(pdf)).toEqual({ status: 'skipped', reason: 'not_an_image' });
    expect(svc.shouldQueue(pdf)).toBe(false);
  });

  // Ciphertext must never reach the model; we skip on the marker, we do NOT
  // "discover" it by letting the decoder choke.
  test('an encrypted object is skipped explicitly', () => {
    for (const meta of [{ encrypted: true }, { e2ee: true }, { encryption: 'aes-gcm' }]) {
      const enc = img({ metadata: meta });
      expect(svc.initialState(enc)).toEqual({ status: 'skipped', reason: 'encrypted' });
      expect(svc.shouldQueue(enc)).toBe(false);
    }
  });

  // "Feature off" must NOT mean "hide every image".
  test('with the feature disabled, images are skipped and stay servable', () => {
    process.env.FILEVAULT_IMAGE_MODERATION = 'false';
    expect(svc.initialState(img())).toEqual({ status: 'skipped', reason: 'feature_disabled' });
    expect(svc.isServableToOthers({ status: 'skipped' })).toBe(true);
  });
});

// ---------------------------------------------------------------- visibility

describe('fail-closed visibility', () => {
  const cases = [
    ['pending', false], ['rejected', false], ['failed', false],
    ['approved', true], ['skipped', true],
  ];
  test.each(cases)('status %s -> servable to others: %s', (status, servable) => {
    expect(svc.isServableToOthers({ status })).toBe(servable);
  });

  test('the uploader always sees their own held image', () => {
    const file = img();
    expect(svc.canServe(file, { status: 'pending' }, 'u1')).toBe(true);
    expect(svc.canServe(file, { status: 'rejected' }, 'u1')).toBe(true);
  });

  test('another user does NOT see a held image', () => {
    expect(svc.canServe(img(), { status: 'pending' }, 'u2')).toBe(false);
  });

  test('an anonymous requester (share link) does NOT see a held image', () => {
    expect(svc.canServe(img(), { status: 'pending' }, undefined)).toBe(false);
    expect(svc.canServe(img(), { status: 'pending' }, null)).toBe(false);
  });

  test('a file with no moderation row (pre-FEAT-031) stays servable', () => {
    expect(svc.canServe(img(), null, 'u2')).toBe(true);
  });
});

// ---------------------------------------------------------------- the invariant
//
// Four call sites write file bytes (upload, group upload, new version, restore)
// and three of them originally forgot to establish moderation state — BUG-017,
// BUG-018, and the restore path. The invariant now lives in ONE helper; these
// tests pin its two modes.

describe('establishModerationState (the single invariant)', () => {
  const fakeModel = () => ({ create: jest.fn(), upsert: jest.fn() });
  const tx = Symbol('transaction');

  test('create: a new image starts pending (hidden) inside the caller transaction', async () => {
    const M = fakeModel();
    const state = await svc.establishModerationState(M, img(), { transaction: tx, mode: 'create' });
    expect(state.status).toBe('pending');
    expect(M.create).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'f1', status: 'pending' }), { transaction: tx });
    expect(M.upsert).not.toHaveBeenCalled();
  });

  test('create: a non-image is skipped and immediately servable', async () => {
    const M = fakeModel();
    const state = await svc.establishModerationState(
      M, img({ mimetype: 'application/pdf' }), { transaction: tx, mode: 'create' });
    expect(state).toEqual({ status: 'skipped', reason: 'not_an_image' });
  });

  // Replacing bytes must not leave the OLD verdict describing the NEW content.
  test('reset: clears the stale verdict and re-hides the image', async () => {
    const M = fakeModel();
    const state = await svc.establishModerationState(M, img(), { transaction: tx, mode: 'reset' });
    expect(state.status).toBe('pending');
    const [row] = M.upsert.mock.calls[0];
    expect(row).toMatchObject({
      fileId: 'f1', status: 'pending',
      riskScore: null, verdict: null, moderationItemId: null,
      altText: null, aiTags: [], attempts: 0,
    });
    expect(M.create).not.toHaveBeenCalled();
  });

  test('reset: an encrypted object stays skipped rather than being re-queued', async () => {
    const M = fakeModel();
    const state = await svc.establishModerationState(
      M, img({ metadata: { encrypted: true } }), { transaction: tx, mode: 'reset' });
    expect(state).toEqual({ status: 'skipped', reason: 'encrypted' });
  });
});

// ---------------------------------------------------------------- evaluate

describe('evaluate()', () => {
  test('a clean image is approved and carries tags', async () => {
    cortex.moderateImage.mockResolvedValue(CLEAN);
    cortex.describeImage.mockResolvedValue(DESC);
    const r = await svc.evaluate(Buffer.from([1]));
    expect(r.status).toBe('approved');
    expect(r.reason).toBe('clean');
    expect(r.aiTags).toEqual(['cat', 'animal']);
    expect(r.altText).toBe('a cat');
  });

  // Escalate-only: held for a human, never auto-deleted.
  test('a flagged image is REJECTED (held), never deleted', async () => {
    cortex.moderateImage.mockResolvedValue(NASTY);
    cortex.describeImage.mockResolvedValue(DESC);
    const r = await svc.evaluate(Buffer.from([1]));
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('flagged');
    expect(r.riskScore).toBe(95);
  });

  test('the risk threshold is configurable and inclusive', async () => {
    process.env.FILEVAULT_IMAGE_RISK_THRESHOLD = '50';
    cortex.moderateImage.mockResolvedValue({ ...CLEAN, riskScore: 50 });
    cortex.describeImage.mockResolvedValue(DESC);
    expect((await svc.evaluate(Buffer.from([1]))).status).toBe('rejected');
  });

  // verdict = fail closed
  test('a verdict failure PROPAGATES (never silently approves)', async () => {
    cortex.moderateImage.mockRejectedValue(
      Object.assign(new Error('router down'), { code: 'LLM_UNAVAILABLE' }));
    await expect(svc.evaluate(Buffer.from([1]))).rejects.toThrow(/router down/);
    expect(cortex.describeImage).not.toHaveBeenCalled();
  });

  // tags = fail soft
  test('a description failure does NOT sink the verdict', async () => {
    cortex.moderateImage.mockResolvedValue(CLEAN);
    cortex.describeImage.mockRejectedValue(new Error('caption model confused'));
    const r = await svc.evaluate(Buffer.from([1]));
    expect(r.status).toBe('approved');
    expect(r.aiTags).toEqual([]);
    expect(r.altText).toBeNull();
  });

  test('the verdict carries no pixel data, only metadata', async () => {
    cortex.moderateImage.mockResolvedValue(CLEAN);
    cortex.describeImage.mockResolvedValue(DESC);
    const r = await svc.evaluate(Buffer.from([1]));
    const blob = JSON.stringify(r);
    expect(blob).not.toMatch(/base64|data:image/);
    expect(r.verdict.imageMeta).toEqual(CLEAN.imageMeta);
  });
});
