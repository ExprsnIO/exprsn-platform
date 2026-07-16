'use strict';

/**
 * TASK-041 — worker:live handleRecording finalize + enqueue.
 * ffmpeg (spawn), ffprobe (execFile), fs, the Recording model, and the
 * moderation service are all mocked; no DB/Rabbit. main() is guarded behind
 * require.main so requiring the worker has no side effects.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

// ffmpeg spawn + ffprobe execFile
let mockNextExitCode = 0;
jest.mock('child_process', () => {
  // eslint-disable-next-line global-require
  const { EventEmitter } = require('events');
  return {
    spawn: jest.fn(() => {
      const proc = new EventEmitter();
      proc.stderr = new EventEmitter();
      // emit close on next tick so the promise wiring is in place
      setImmediate(() => proc.emit('close', mockNextExitCode));
      return proc;
    }),
    execFile: jest.fn((bin, args, opts, cb) => cb(null, '42.7\n', '')),
  };
});

jest.mock('fs', () => ({ statSync: jest.fn(() => ({ size: 123456 })) }));

// live models — Recording only; sequelize.authenticate is never called (main guarded)
const mockRecordingRow = { id: 'rec-1', metadata: {}, update: jest.fn(async function u(p) { Object.assign(this, p); return this; }) };
jest.mock('../src/models', () => ({
  sequelize: { authenticate: jest.fn(), close: jest.fn() },
  Recording: {
    findByPk: jest.fn(async () => mockRecordingRow),
    update: jest.fn(async () => [1]),
  },
}));

jest.mock('../src/services/recordingModeration', () => ({
  establishAndEnqueue: jest.fn(async () => ({ status: 'pending' })),
}));

// liveQueue is required for FANOUT/RECORDING constants; stub it
jest.mock('../src/services/liveQueue', () => ({
  FANOUT: { exchange: 'x', queue: 'x', routingKey: 'x' },
  RECORDING: { exchange: 'r', queue: 'r', routingKey: 'r' },
}));
jest.mock('@exprsn/shared/utils/rabbit', () => ({ setLogger() {}, isEnabled: () => false }));

const { Recording } = require('../src/models');
const recordingModeration = require('../src/services/recordingModeration');
const worker = require('../src/worker');

beforeEach(() => {
  jest.clearAllMocks();
  mockNextExitCode = 0;
  mockRecordingRow.metadata = {};
});

describe('handleRecording finalize (TASK-041)', () => {
  test('a clean ffmpeg exit finalizes the row to ready and enqueues moderation', async () => {
    await worker.handleRecording({ recordingId: 'rec-1', roomId: 'room-1', inputUrl: 'u', outputPath: '/tmp/out.mp4' });

    expect(mockRecordingRow.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ready',
      storage_url: '/tmp/out.mp4',
      file_size_bytes: 123456,
      duration_seconds: 43, // Math.round(42.7)
    }));
    expect(mockRecordingRow.update.mock.calls[0][0].completed_at).toBeInstanceOf(Date);
    expect(recordingModeration.establishAndEnqueue).toHaveBeenCalledWith(mockRecordingRow);
  });

  test('a moderation enqueue failure does NOT fail the recording (best-effort)', async () => {
    recordingModeration.establishAndEnqueue.mockRejectedValueOnce(new Error('redis down'));
    await expect(
      worker.handleRecording({ recordingId: 'rec-1', outputPath: '/tmp/out.mp4', inputUrl: 'u' }),
    ).resolves.toBeUndefined();
    expect(mockRecordingRow.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready' }));
  });

  test('an ffmpeg failure marks the row failed and rethrows for retry', async () => {
    mockNextExitCode = 1;
    await expect(
      worker.handleRecording({ recordingId: 'rec-1', outputPath: '/tmp/out.mp4', inputUrl: 'u' }),
    ).rejects.toThrow(/ffmpeg exit 1/);
    // markRecordingFailed did a findByPk + update to 'failed'
    expect(mockRecordingRow.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    // never finalized to ready, never enqueued
    expect(recordingModeration.establishAndEnqueue).not.toHaveBeenCalled();
  });

  test('a job without a recordingId runs ffmpeg but does not finalize a row', async () => {
    await worker.handleRecording({ outputPath: '/tmp/out.mp4', inputUrl: 'u' });
    expect(Recording.findByPk).not.toHaveBeenCalled();
    expect(recordingModeration.establishAndEnqueue).not.toHaveBeenCalled();
  });

  test('a missing outputPath is rejected up front', async () => {
    await expect(worker.handleRecording({ recordingId: 'rec-1', inputUrl: 'u' }))
      .rejects.toThrow(/missing outputPath/);
  });
});
