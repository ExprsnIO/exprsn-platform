'use strict';

/**
 * FEAT-073 — video moderation WORKER (processVideo). Models, the pipeline, the
 * queue, moderator, and cortex are all mocked. Asserts the fail-closed row
 * transitions, the retry-vs-terminal split, escalation shape, and the
 * stale-bytes guard.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';

const mockFile = { findByPk: jest.fn() };
const mockRecord = { update: jest.fn(), attempts: 0, status: 'pending', reason: null };
const mockFileModeration = {
  findOrCreate: jest.fn(async () => [mockRecord, true]),
  update: jest.fn(),
  findAll: jest.fn(async () => []),
};

jest.mock('../../src/models', () => ({
  File: mockFile,
  FileModeration: mockFileModeration,
  sequelize: { authenticate: jest.fn(), close: jest.fn() },
}));
jest.mock('../../../../src/workers/videoModeration/pipeline', () => ({ evaluateVideo: jest.fn() }));
jest.mock('../../src/queues/videoModeration', () => ({
  initQueues: jest.fn(),
  closeQueues: jest.fn(),
  queues: { videoModeration: { process: jest.fn(), getJob: jest.fn() } },
  requeueVideoModeration: jest.fn(async () => true),
}));
jest.mock('../../../cortex/src/client', () => ({
  moderateImage: jest.fn(), describeImage: jest.fn(),
  moderateFrames: jest.fn(), describeFrames: jest.fn(),
}));
jest.mock('@exprsn/shared', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const mockModerateContent = jest.fn(async () => ({ moderationId: 'mod-1' }));
jest.mock('../../../moderator/services/moderationService', () => ({
  moderateContent: mockModerateContent,
}));

const pipeline = require('../../../../src/workers/videoModeration/pipeline');
const { processVideo } = require('../../../../src/workers/videoModeration/index');

const fileRow = (over = {}) => ({
  id: 'v1', userId: 'u1', mimetype: 'video/mp4', metadata: {},
  contentHash: 'hash-A', storageKey: 'k', storageBackend: 'disk', ...over,
});

const CLEAN_PATCH = {
  status: 'approved', reason: 'clean', riskScore: 3, verdict: { riskScore: 3, framesInspected: 3 },
  provider: 'cortex', model: 'vl', altText: 'x', aiTags: [], textInImage: '', lastError: null,
};
const REJECT_PATCH = {
  status: 'rejected', reason: 'flagged', riskScore: 96,
  verdict: { riskScore: 96, nsfwScore: 98, framesInspected: 3, frameScores: [{ frame: 0, riskScore: 96 }] },
  provider: 'cortex', model: 'vl', altText: 'x', aiTags: [], textInImage: '', lastError: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRecord.attempts = 0;
  mockRecord.status = 'pending';
  mockRecord.reason = null;
});

describe('processVideo — fail closed', () => {
  test('a clean video is approved when the bytes are unchanged', async () => {
    mockFile.findByPk
      .mockResolvedValueOnce(fileRow())
      .mockResolvedValueOnce({ id: 'v1', contentHash: 'hash-A' });
    pipeline.evaluateVideo.mockResolvedValue(CLEAN_PATCH);

    const r = await processVideo('v1');
    expect(r).toMatchObject({ status: 'approved' });
    expect(mockRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', riskScore: 3 }));
  });

  test('a transient failure (LLM_UNAVAILABLE) leaves the row PENDING and RETHROWS for Bull', async () => {
    mockFile.findByPk.mockResolvedValueOnce(fileRow());
    pipeline.evaluateVideo.mockRejectedValue(
      Object.assign(new Error('router down'), { code: 'LLM_UNAVAILABLE' }));

    await expect(processVideo('v1')).rejects.toThrow(/router down/);
    const written = mockRecord.update.mock.calls.map(([v]) => v);
    // hidden, not approved
    expect(written[0]).toMatchObject({ status: 'pending', reason: 'error' });
    expect(written.some((v) => v.status === 'approved')).toBe(false);
  });

  test('UNSUPPORTED_VIDEO is TERMINAL — row failed, no rethrow (Bull will not retry)', async () => {
    mockFile.findByPk.mockResolvedValueOnce(fileRow());
    pipeline.evaluateVideo.mockRejectedValue(
      Object.assign(new Error('bad container'), { code: 'UNSUPPORTED_VIDEO' }));

    const r = await processVideo('v1');
    expect(r).toEqual({ status: 'failed', reason: 'unsupported_video' });
    expect(mockRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', reason: 'unsupported_video' }));
  });
});

describe('processVideo — escalation', () => {
  test('a rejected verdict escalates with contentType video + precomputedResult', async () => {
    mockFile.findByPk
      .mockResolvedValueOnce(fileRow())
      .mockResolvedValueOnce({ id: 'v1', contentHash: 'hash-A' });
    pipeline.evaluateVideo.mockResolvedValue(REJECT_PATCH);

    const r = await processVideo('v1');
    expect(r).toMatchObject({ status: 'rejected' });
    expect(mockModerateContent).toHaveBeenCalledWith(expect.objectContaining({
      contentType: 'video',
      contentId: 'v1',
      sourceService: 'filevault',
      precomputedResult: REJECT_PATCH.verdict,
    }));
    // the moderation item id is written back
    expect(mockFileModeration.update).toHaveBeenCalledWith(
      { moderationItemId: 'mod-1' }, { where: { fileId: 'v1' } });
  });
});

describe('processVideo — stale-bytes guard', () => {
  test('discards the verdict (and does not approve) when the hash changed mid-evaluation', async () => {
    mockFile.findByPk
      .mockResolvedValueOnce(fileRow({ contentHash: 'hash-A' }))
      .mockResolvedValueOnce({ id: 'v1', contentHash: 'hash-B' });
    pipeline.evaluateVideo.mockResolvedValue(CLEAN_PATCH);

    const r = await processVideo('v1');
    expect(r).toEqual({ status: 'superseded' });
    const written = mockRecord.update.mock.calls.map(([v]) => v);
    expect(written.some((v) => v.status === 'approved')).toBe(false);
    expect(written[written.length - 1]).toEqual({ attempts: 1 });
  });
});
