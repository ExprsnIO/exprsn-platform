'use strict';

/**
 * The stale-verdict race.
 *
 * Inference takes seconds. If `updateFile()` / `restoreVersion()` replaces a
 * file's bytes during that window, the worker would otherwise write a verdict
 * computed from the OLD bytes onto the NEW content — re-approving content nobody
 * ever looked at. The worker's `approved`/`rejected` early-return cannot catch
 * this: it runs *before* the evaluation.
 *
 * The guard is a compare-and-set on `contentHash`.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.FILEVAULT_IMAGE_MODERATION = 'true';

const mockFile = { findByPk: jest.fn() };
const mockRecord = { update: jest.fn(), attempts: 0, status: 'pending' };
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
}));
jest.mock('@exprsn/shared', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const mockEvaluate = jest.fn();
jest.mock('../../src/services/imageModerationService', () => {
  const actual = jest.requireActual('../../src/services/imageModerationService');
  return { ...actual, evaluate: mockEvaluate };
});

const { processFile } = require('../../src/worker');

const CLEAN_PATCH = {
  status: 'approved', reason: 'clean', riskScore: 2, verdict: { riskScore: 2 },
  provider: 'cortex', model: 'vl', altText: 'x', aiTags: [], textInImage: '', lastError: null,
};

const fileRow = (hash) => ({
  id: 'f1', userId: 'u1', mimetype: 'image/png', metadata: {},
  contentHash: hash, storageKey: 'k', storageBackend: 'local',
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRecord.attempts = 0;
  mockRecord.status = 'pending';
});

describe('stale-verdict race (bytes replaced during inference)', () => {
  test('discards the verdict when the content hash changed mid-evaluation', async () => {
    // first read: hash A (what we judge). post-evaluation re-read: hash B.
    mockFile.findByPk
      .mockResolvedValueOnce(fileRow('hash-A'))
      .mockResolvedValueOnce({ id: 'f1', contentHash: 'hash-B' });
    mockEvaluate.mockResolvedValue(CLEAN_PATCH);

    const result = await processFile('f1');

    expect(result).toEqual({ status: 'superseded' });
    // the approval must NOT have been written
    const written = mockRecord.update.mock.calls.map(([v]) => v);
    expect(written.some((v) => v.status === 'approved')).toBe(false);
    // only the attempt counter moved
    expect(written[written.length - 1]).toEqual({ attempts: 1 });
  });

  test('applies the verdict when the bytes are unchanged', async () => {
    mockFile.findByPk
      .mockResolvedValueOnce(fileRow('hash-A'))
      .mockResolvedValueOnce({ id: 'f1', contentHash: 'hash-A' });
    mockEvaluate.mockResolvedValue(CLEAN_PATCH);

    const result = await processFile('f1');

    expect(result).toMatchObject({ status: 'approved' });
    expect(mockRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', riskScore: 2 }));
  });

  test('a file deleted mid-evaluation does not get its verdict written', async () => {
    mockFile.findByPk
      .mockResolvedValueOnce(fileRow('hash-A'))
      .mockResolvedValueOnce(null);
    mockEvaluate.mockResolvedValue(CLEAN_PATCH);

    const result = await processFile('f1');
    expect(result).toEqual({ status: 'superseded' });
  });
});
