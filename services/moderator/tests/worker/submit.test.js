'use strict';

/**
 * FEAT-009 / ADR 0004 §4.1 — the submitForModeration producer surface.
 * Bull is mocked; no Redis. Pins the jobId shape, the reset/BUG-016 stale-job
 * removal, best-effort (never-throw) semantics, and payload normalisation.
 */

const mockAdd = jest.fn();
const mockGetJob = jest.fn();
const mockClose = jest.fn();
const mockOn = jest.fn();

jest.mock('bull', () => jest.fn().mockImplementation(() => ({
  add: (...a) => mockAdd(...a),
  getJob: (...a) => mockGetJob(...a),
  on: (...a) => mockOn(...a),
  close: (...a) => mockClose(...a),
})));

const ugc = require('../../src/queues/ugcModeration');

const PAYLOAD = {
  sourceService: 'timeline',
  contentType: 'post',
  contentId: 'post-1',
  userId: 'u1',
  contentText: 'hello',
  contentHash: 'deadbeef',
};

beforeEach(() => {
  mockAdd.mockReset().mockResolvedValue({ id: 'timeline:post:post-1' });
  mockGetJob.mockReset().mockResolvedValue(null);
});

afterEach(async () => { await ugc.closeQueues(); });

describe('submitForModeration', () => {
  test('enqueues with jobId `<service>:<type>:<id>` and the normalised payload', async () => {
    const ok = await ugc.submitForModeration(PAYLOAD);
    expect(ok).toBe(true);
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [jobName, data, opts] = mockAdd.mock.calls[0];
    expect(jobName).toBe(ugc.JOB_NAME);
    expect(opts).toEqual({ jobId: 'timeline:post:post-1' });
    expect(data).toEqual(expect.objectContaining({
      sourceService: 'timeline', contentType: 'post', contentId: 'post-1',
      userId: 'u1', contentText: 'hello', contentHash: 'deadbeef',
    }));
  });

  test('mode:reset removes the stale job first (BUG-016) then re-adds', async () => {
    const remove = jest.fn().mockResolvedValue();
    mockGetJob.mockResolvedValue({ id: 'timeline:post:post-1', remove });

    const ok = await ugc.submitForModeration({ ...PAYLOAD, mode: 'reset' });
    expect(ok).toBe(true);
    expect(mockGetJob).toHaveBeenCalledWith('timeline:post:post-1');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  test('mode:reset with no live job still enqueues', async () => {
    mockGetJob.mockResolvedValue(null);
    const ok = await ugc.submitForModeration({ ...PAYLOAD, mode: 'reset' });
    expect(ok).toBe(true);
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  test('mode:create does NOT probe for a stale job', async () => {
    await ugc.submitForModeration(PAYLOAD);
    expect(mockGetJob).not.toHaveBeenCalled();
  });

  test('invalid payload (missing contentId) returns false, never enqueues', async () => {
    const ok = await ugc.submitForModeration({ sourceService: 'spark', contentType: 'message' });
    expect(ok).toBe(false);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  test('best-effort: a Redis/enqueue error is swallowed and returns false', async () => {
    mockAdd.mockRejectedValue(new Error('redis down'));
    const ok = await ugc.submitForModeration(PAYLOAD);
    expect(ok).toBe(false); // never throws into the caller
  });

  test('contentHash is auto-derived from contentText when the producer omits it', async () => {
    await ugc.submitForModeration({ sourceService: 'spark', contentType: 'message', contentId: 'm1', contentText: 'hi there' });
    const [, data] = mockAdd.mock.calls[0];
    expect(data.contentHash).toBe(ugc.hashContent('hi there'));
    expect(data.contentHash).toHaveLength(64); // sha256 hex
  });
});

describe('jobIdFor / hashContent helpers', () => {
  test('jobIdFor composes the three discriminators', () => {
    expect(ugc.jobIdFor({ sourceService: 'spark', contentType: 'message', contentId: 'm9' }))
      .toBe('spark:message:m9');
  });
  test('hashContent is deterministic and null-safe', () => {
    expect(ugc.hashContent('x')).toBe(ugc.hashContent('x'));
    expect(ugc.hashContent(null)).toBe(ugc.hashContent(''));
  });
});
