'use strict';

/**
 * FEAT-074 — Live recording moderation SERVICE (mode parsing, risk threshold,
 * the fail-closed visibility gate, and establish-and-enqueue). No DB/Redis/Bull:
 * the RecordingModeration model and the queue are mocked, mirroring the FileVault
 * imageModerationService unit style.
 */

const mockUpsert = jest.fn(async () => [{}, true]);
const mockEnqueue = jest.fn(async () => true);

jest.mock('../src/models', () => ({ RecordingModeration: { upsert: mockUpsert } }));
jest.mock('../src/queues/recordingModeration', () => ({ enqueueRecordingModeration: mockEnqueue }));
jest.mock('@exprsn/shared', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const svc = require('../src/services/recordingModeration');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.LIVE_RECORDING_MODERATION;
  delete process.env.LIVE_RECORDING_RISK_THRESHOLD;
});

// ---------------------------------------------------------------- mode parsing

describe('moderationMode() — off | shadow | enforce ("true" aliases enforce)', () => {
  const cases = [
    [undefined, 'off'], ['', 'off'], ['off', 'off'], ['false', 'off'], ['nonsense', 'off'],
    ['shadow', 'shadow'], ['SHADOW', 'shadow'], ['  shadow  ', 'shadow'],
    ['enforce', 'enforce'], ['ENFORCE', 'enforce'], ['true', 'enforce'],
  ];
  test.each(cases)('%s -> %s', (raw, expected) => {
    if (raw === undefined) delete process.env.LIVE_RECORDING_MODERATION;
    else process.env.LIVE_RECORDING_MODERATION = raw;
    expect(svc.moderationMode()).toBe(expected);
  });

  test('featureEnabled() is false only when off', () => {
    process.env.LIVE_RECORDING_MODERATION = 'off';
    expect(svc.featureEnabled()).toBe(false);
    process.env.LIVE_RECORDING_MODERATION = 'shadow';
    expect(svc.featureEnabled()).toBe(true);
    process.env.LIVE_RECORDING_MODERATION = 'enforce';
    expect(svc.featureEnabled()).toBe(true);
  });
});

// ---------------------------------------------------------------- risk threshold

describe('riskThreshold()', () => {
  test('defaults to 70', () => {
    expect(svc.riskThreshold()).toBe(70);
  });
  test('is configurable from LIVE_RECORDING_RISK_THRESHOLD', () => {
    process.env.LIVE_RECORDING_RISK_THRESHOLD = '55';
    expect(svc.riskThreshold()).toBe(55);
  });
  test('a non-numeric value falls back to the default', () => {
    process.env.LIVE_RECORDING_RISK_THRESHOLD = 'abc';
    expect(svc.riskThreshold()).toBe(70);
  });
});

// ---------------------------------------------------------------- visibility gate

describe('isServable() — fail-closed visibility gate', () => {
  test('no moderation row (feature off / predates FEAT-074) is servable', () => {
    expect(svc.isServable(null)).toBe(true);
    expect(svc.isServable(undefined)).toBe(true);
  });
  test('approved and skipped are servable', () => {
    expect(svc.isServable({ status: 'approved' })).toBe(true);
    expect(svc.isServable({ status: 'skipped' })).toBe(true);
  });
  test('pending, failed, and rejected stay hidden', () => {
    expect(svc.isServable({ status: 'pending' })).toBe(false);
    expect(svc.isServable({ status: 'failed' })).toBe(false);
    expect(svc.isServable({ status: 'rejected' })).toBe(false);
  });
});

// ---------------------------------------------------------------- establish + enqueue

describe('establishAndEnqueue()', () => {
  const rec = { id: 'rec-1' };

  test('off: no row is written and nothing is enqueued', async () => {
    process.env.LIVE_RECORDING_MODERATION = 'off';
    const r = await svc.establishAndEnqueue(rec);
    expect(r).toEqual({ status: 'skipped', reason: 'feature_disabled' });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  test('enforce: upserts a PENDING (hidden) row and enqueues', async () => {
    process.env.LIVE_RECORDING_MODERATION = 'enforce';
    const r = await svc.establishAndEnqueue(rec);
    expect(r).toEqual({ status: 'pending', reason: null });
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      recording_id: 'rec-1', status: 'pending', reason: null, attempts: 0,
      risk_score: null, verdict: null, moderation_item_id: null,
    }));
    expect(mockEnqueue).toHaveBeenCalledWith('rec-1');
  });

  test('shadow: upserts an APPROVED/shadow_pending row (servable) and enqueues', async () => {
    process.env.LIVE_RECORDING_MODERATION = 'shadow';
    const r = await svc.establishAndEnqueue(rec);
    expect(r).toEqual({ status: 'approved', reason: 'shadow_pending' });
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      recording_id: 'rec-1', status: 'approved', reason: 'shadow_pending',
    }));
    expect(mockEnqueue).toHaveBeenCalledWith('rec-1');
    // shadow rows are immediately servable
    expect(svc.isServable({ status: 'approved' })).toBe(true);
  });
});
