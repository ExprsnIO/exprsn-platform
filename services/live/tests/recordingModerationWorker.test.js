'use strict';

/**
 * FEAT-074 — the Live recording-moderation WORKER (`processRecording`). The live
 * models, the pipeline, the queue, the cortex job-context wrapper, and moderator
 * are all mocked. Asserts the fail-closed row transitions, the retry-vs-terminal
 * split, the escalation shape, and the not-ready / feature-off guards. No DB.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const mockRecording = { findByPk: jest.fn() };
const mockRecordingModeration = { findOrCreate: jest.fn(), update: jest.fn() };
const mockRecord = { update: jest.fn(), attempts: 0, status: 'pending', reason: null };

jest.mock('../src/models', () => ({
  sequelize: { authenticate: jest.fn(), close: jest.fn() },
  Recording: mockRecording,
  RecordingModeration: mockRecordingModeration,
}));

let mockMode = 'enforce';
jest.mock('../src/services/recordingModeration', () => ({
  moderationMode: () => mockMode,
  riskThreshold: () => 70,
}));

jest.mock('../src/queues/recordingModeration', () => ({
  initQueues: jest.fn(),
  closeQueues: jest.fn(),
  requeueRecordingModeration: jest.fn(async () => true),
  queues: { recordingModeration: { process: jest.fn(), getJob: jest.fn() } },
}));

jest.mock('../../cortex/src/backends/jobContext', () => ({
  runInJobContext: (ctx, fn) => fn(),
}));

jest.mock('../../../src/workers/videoModeration/pipeline', () => ({ evaluateLocalVideo: jest.fn() }));

const mockModerateContent = jest.fn(async () => ({ moderationId: 'mod-1' }));
jest.mock('../../moderator/services/moderationService', () => ({ moderateContent: mockModerateContent }));

jest.mock('@exprsn/shared', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const pipeline = require('../../../src/workers/videoModeration/pipeline');
const { processRecording } = require('../../../src/workers/recordingModeration/index');

const recRow = (over = {}) => ({
  id: 'rec-1', user_id: 'u1', room_id: 'room-1', stream_id: null,
  status: 'ready', storage_url: '/var/rec/rec-1.mp4', ...over,
});

const CLEAN_PATCH = {
  status: 'approved', reason: 'clean', riskScore: 3,
  verdict: { riskScore: 3, framesInspected: 3 },
  provider: 'cortex', backend: 'llama', model: 'vl', altText: 'x', aiTags: [], textInImage: '', lastError: null,
};
const REJECT_PATCH = {
  status: 'rejected', reason: 'flagged', riskScore: 96,
  verdict: { riskScore: 96, nsfwScore: 98, framesInspected: 3, frameScores: [{ frame: 0, riskScore: 96 }] },
  provider: 'cortex', backend: 'llama', model: 'vl', altText: 'a caption', aiTags: [], textInImage: 'sign', lastError: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMode = 'enforce';
  mockRecord.attempts = 0;
  mockRecord.status = 'pending';
  mockRecord.reason = null;
  mockRecordingModeration.findOrCreate.mockResolvedValue([mockRecord, true]);
});

// ---------------------------------------------------------------- guards

describe('processRecording — guards', () => {
  test('a vanished recording is skipped', async () => {
    mockRecording.findByPk.mockResolvedValue(null);
    expect(await processRecording('rec-1')).toEqual({ skipped: true });
    expect(pipeline.evaluateLocalVideo).not.toHaveBeenCalled();
  });

  test('a recording that is not "ready" is skipped (no bytes to inspect)', async () => {
    mockRecording.findByPk.mockResolvedValue(recRow({ status: 'processing' }));
    expect(await processRecording('rec-1')).toEqual({ skipped: true, reason: 'not_ready' });
    expect(mockRecordingModeration.findOrCreate).not.toHaveBeenCalled();
    expect(pipeline.evaluateLocalVideo).not.toHaveBeenCalled();
  });

  test('a recording with no storage_url is skipped', async () => {
    mockRecording.findByPk.mockResolvedValue(recRow({ storage_url: null }));
    expect(await processRecording('rec-1')).toEqual({ skipped: true, reason: 'no_path' });
  });

  test('mode off marks the row skipped/feature_disabled and never inspects', async () => {
    mockMode = 'off';
    mockRecording.findByPk.mockResolvedValue(recRow());
    const r = await processRecording('rec-1');
    expect(r).toEqual({ status: 'skipped' });
    expect(mockRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'skipped', reason: 'feature_disabled' }));
    expect(pipeline.evaluateLocalVideo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- verdicts

describe('processRecording — verdicts', () => {
  test('a clean verdict approves the row', async () => {
    mockRecording.findByPk.mockResolvedValue(recRow());
    pipeline.evaluateLocalVideo.mockResolvedValue(CLEAN_PATCH);
    const r = await processRecording('rec-1');
    expect(r).toMatchObject({ status: 'approved' });
    expect(mockRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', reason: 'clean', risk_score: 3 }));
    expect(mockModerateContent).not.toHaveBeenCalled();
  });

  test('a rejected verdict escalates to moderator with video + precomputedResult and writes back the item id', async () => {
    const recording = recRow();
    mockRecording.findByPk.mockResolvedValue(recording);
    pipeline.evaluateLocalVideo.mockResolvedValue(REJECT_PATCH);

    const r = await processRecording('rec-1');
    expect(r).toMatchObject({ status: 'rejected' });
    expect(mockModerateContent).toHaveBeenCalledWith(expect.objectContaining({
      contentType: 'video',
      contentId: 'rec-1',
      sourceService: 'live',
      userId: 'u1',
      precomputedResult: REJECT_PATCH.verdict,
    }));
    expect(mockRecordingModeration.update).toHaveBeenCalledWith(
      { moderation_item_id: 'mod-1' }, { where: { recording_id: 'rec-1' } });
  });
});

// ---------------------------------------------------------------- fail closed

describe('processRecording — fails CLOSED', () => {
  test('UNSUPPORTED_VIDEO is TERMINAL: row failed, no rethrow (Bull will not retry)', async () => {
    mockRecording.findByPk.mockResolvedValue(recRow());
    pipeline.evaluateLocalVideo.mockRejectedValue(
      Object.assign(new Error('bad container'), { code: 'UNSUPPORTED_VIDEO' }));

    const r = await processRecording('rec-1');
    expect(r).toEqual({ status: 'failed', reason: 'unsupported_video' });
    const written = mockRecord.update.mock.calls.map(([v]) => v);
    expect(written[0]).toMatchObject({ status: 'failed', reason: 'unsupported_video' });
    expect(written.some((v) => v.status === 'approved')).toBe(false);
  });

  test('a transient failure (LLM_UNAVAILABLE) leaves the row PENDING and RETHROWS for Bull', async () => {
    mockRecording.findByPk.mockResolvedValue(recRow());
    pipeline.evaluateLocalVideo.mockRejectedValue(
      Object.assign(new Error('router down'), { code: 'LLM_UNAVAILABLE' }));

    await expect(processRecording('rec-1')).rejects.toThrow(/router down/);
    const written = mockRecord.update.mock.calls.map(([v]) => v);
    expect(written[0]).toMatchObject({ status: 'pending', reason: 'error' });
    expect(written.some((v) => v.status === 'approved')).toBe(false);
  });
});
