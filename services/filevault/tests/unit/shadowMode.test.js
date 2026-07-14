'use strict';

/**
 * TASK-026 — image moderation shadow rung, at the WORKER level.
 *
 * Proves the enforce/shadow split on the ACT side, not just the verdict side:
 *   - enforce + flagged -> the row is HELD (`rejected`) AND escalated to
 *     moderator's review queue.
 *   - shadow  + flagged -> the row is RECORDED (`approved`/`shadow_flagged`,
 *     riskScore + verdict persisted) but NEVER held and NEVER escalated.
 *
 * `evaluate` is REAL here (only the cortex façade is mocked) so the mode gate is
 * exercised end to end; moderator's moderationService is mocked to observe
 * whether escalation fires.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const mockFile = { findByPk: jest.fn() };
const mockRecord = { update: jest.fn(), attempts: 0, status: 'pending', reason: null };
const mockFileModeration = {
  findOrCreate: jest.fn(async () => [mockRecord, true]),
  update: jest.fn(),
};

jest.mock('../../src/models', () => ({
  File: mockFile,
  FileModeration: mockFileModeration,
  sequelize: { authenticate: jest.fn(), close: jest.fn() },
}));
jest.mock('../../src/storage', () => ({ retrieve: jest.fn(async () => Buffer.from([1, 2, 3])) }));
jest.mock('../../src/queues/imageModeration', () => ({
  initQueues: jest.fn(), closeQueues: jest.fn(), queues: { imageModeration: { process: jest.fn() } },
  enqueueImageModeration: jest.fn(),
}));
jest.mock('@exprsn/shared', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

// Real evaluate() — mock ONLY the cortex façade it calls.
jest.mock('../../../cortex/src/client', () => ({
  isEnabled: jest.fn(() => true),
  moderateImage: jest.fn(),
  describeImage: jest.fn(),
}));

// Observe whether a flagged image is escalated to moderator (the "enforce" act).
const mockModerateContent = jest.fn(async () => ({ id: 'mod-1' }));
jest.mock('../../../moderator/services/moderationService', () => ({
  moderateContent: (...a) => mockModerateContent(...a),
}));

const cortex = require('../../../cortex/src/client');
const { processFile } = require('../../src/worker');

const CLEAN = {
  provider: 'cortex', model: 'test-vl', riskScore: 3,
  nsfwScore: 0, flags: [], explanation: 'benign',
  imageMeta: { format: 'png', width: 10, height: 10, pages: 1, sampled: 1 },
};
const NASTY = { ...CLEAN, riskScore: 95, nsfwScore: 97, flags: ['nsfw'] };
const DESC = { altText: 'a picture', tags: ['x'], textInImage: '' };

const fileRow = () => ({
  id: 'f1', userId: 'u1', mimetype: 'image/png', metadata: {},
  contentHash: 'h1', storageKey: 'k', storageBackend: 'local',
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.FILEVAULT_IMAGE_RISK_THRESHOLD;
  mockRecord.attempts = 0;
  cortex.moderateImage.mockResolvedValue(NASTY);
  cortex.describeImage.mockResolvedValue(DESC);
  // File.findByPk is called twice: once to load, once for the hash CAS. Same hash.
  mockFile.findByPk.mockResolvedValue(fileRow());
});

describe('enforce mode (FILEVAULT_IMAGE_MODERATION=enforce)', () => {
  beforeEach(() => {
    process.env.FILEVAULT_IMAGE_MODERATION = 'enforce';
    mockRecord.status = 'pending';
    mockRecord.reason = null;
  });

  test('a flagged image is HELD (rejected) and ESCALATED', async () => {
    const out = await processFile('f1');
    expect(out.status).toBe('rejected');
    // held:
    expect(mockRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', reason: 'flagged', riskScore: 95 }));
    // escalated:
    expect(mockModerateContent).toHaveBeenCalledTimes(1);
    expect(mockModerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image', precomputedResult: NASTY }));
  });
});

describe('shadow mode (FILEVAULT_IMAGE_MODERATION=shadow)', () => {
  beforeEach(() => {
    process.env.FILEVAULT_IMAGE_MODERATION = 'shadow';
    // The row was seeded servable (approved/shadow_pending) by the upload path.
    mockRecord.status = 'approved';
    mockRecord.reason = 'shadow_pending';
  });

  test('a flagged image RECORDS the verdict but is NOT held and NOT escalated', async () => {
    const out = await processFile('f1');
    // recorded verdict, but servable status:
    expect(out.status).toBe('approved');
    expect(mockRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', reason: 'shadow_flagged', riskScore: 95 }));
    const patch = mockRecord.update.mock.calls[0][0];
    expect(patch.verdict).toEqual(NASTY); // the real image scores are persisted
    // NOT enforced: never escalated to human review.
    expect(mockModerateContent).not.toHaveBeenCalled();
  });

  test('a servable/shadow_pending row is NOT treated as already-resolved', async () => {
    // If the worker short-circuited on status==='approved', evaluate would never
    // run and the verdict would never be recorded.
    await processFile('f1');
    expect(cortex.moderateImage).toHaveBeenCalledTimes(1);
    expect(mockRecord.update).toHaveBeenCalled();
  });
});
