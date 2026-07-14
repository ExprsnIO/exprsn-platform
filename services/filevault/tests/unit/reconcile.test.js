'use strict';

/**
 * TASK-025 — reconcile images orphaned in `pending`.
 *
 * The moderation job is enqueued best-effort after the upload commits. A crash
 * (or a Redis blip) in that window leaves a row `pending` — hidden — with no job
 * to ever clear it. The worker sweeps for these and re-queues them.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const mockFindAll = jest.fn();
const mockGetJob = jest.fn();
const mockEnqueue = jest.fn(async () => true);
const mockRequeue = jest.fn(async () => true);

jest.mock('../../src/models', () => ({
  File: {},
  FileModeration: { findAll: (...a) => mockFindAll(...a) },
  sequelize: { authenticate: jest.fn(), close: jest.fn() },
}));
jest.mock('../../src/storage', () => ({ retrieve: jest.fn() }));
jest.mock('../../src/queues/imageModeration', () => ({
  initQueues: jest.fn(), closeQueues: jest.fn(),
  queues: { imageModeration: { getJob: (...a) => mockGetJob(...a), process: jest.fn() } },
  enqueueImageModeration: (...a) => mockEnqueue(...a),
  requeueImageModeration: (...a) => mockRequeue(...a),
}));
jest.mock('@exprsn/shared', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { reconcileStuckPending } = require('../../src/worker');

beforeEach(() => {
  jest.clearAllMocks();
  mockEnqueue.mockResolvedValue(true);
  mockRequeue.mockResolvedValue(true);
});

describe('reconcileStuckPending', () => {
  test('re-queues a stuck pending row that has no job', async () => {
    mockFindAll.mockResolvedValue([{ fileId: 'a' }, { fileId: 'b' }]);
    mockGetJob.mockResolvedValue(null); // no existing job

    const n = await reconcileStuckPending();

    expect(n).toBe(2);
    expect(mockRequeue).toHaveBeenCalledWith('a');
    expect(mockRequeue).toHaveBeenCalledWith('b');
  });

  test('skips a row that already has a live (waiting) job — no double-queue', async () => {
    mockFindAll.mockResolvedValue([{ fileId: 'a' }]);
    mockGetJob.mockResolvedValue({ getState: async () => 'waiting' });

    const n = await reconcileStuckPending();

    expect(n).toBe(0);
    expect(mockRequeue).not.toHaveBeenCalled();
  });

  test('re-queues a row whose old job is completed/failed (dead key) via remove-then-add', async () => {
    mockFindAll.mockResolvedValue([{ fileId: 'a' }]);
    mockGetJob.mockResolvedValue({ getState: async () => 'completed' });

    const n = await reconcileStuckPending();
    expect(n).toBe(1);
    // Must use requeue (getJob->remove->add), NOT plain enqueue: a lingering
    // terminal job key would make add() a silent no-op (BUG-016), so a plain
    // enqueue could never clear this stuck-pending row. This assertion pins the fix.
    expect(mockRequeue).toHaveBeenCalledWith('a');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  test('only considers rows older than the grace window', async () => {
    mockFindAll.mockResolvedValue([]);
    await reconcileStuckPending();

    const where = mockFindAll.mock.calls[0][0].where;
    // an updatedAt < cutoff filter is present
    const opLt = Object.getOwnPropertySymbols(where.updatedAt)[0];
    expect(where.updatedAt[opLt]).toBeInstanceOf(Date);
    expect(where.updatedAt[opLt].getTime()).toBeLessThan(Date.now());
    // ...and both stranded-before-scoring cases are swept (TASK-025 + -026):
    // enforce `pending` (hidden) and shadow `approved`/`shadow_pending` (servable).
    const opOr = Object.getOwnPropertySymbols(where)[0];
    const branches = where[opOr];
    expect(branches).toEqual(expect.arrayContaining([
      { status: 'pending' },
      { status: 'approved', reason: 'shadow_pending' },
    ]));
  });

  test('never throws — a DB failure is logged, not propagated', async () => {
    mockFindAll.mockRejectedValue(new Error('db down'));
    await expect(reconcileStuckPending()).resolves.toBe(0);
  });
});
