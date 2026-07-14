'use strict';

/**
 * FEAT-009 / ADR 0004 §4.2 — the UGC moderation worker terminal-state ladder.
 *
 * Pure, dependency-injected logic: no Postgres, no Redis, no AI provider. Every
 * dependency (the verdict engine, the AI-provider guard, the module sink) is
 * injected, so these pin the ladder's decisions exactly.
 */

const worker = require('../../src/worker');

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

function makeJob(data, { attemptsMade = 0, attempts = 4 } = {}) {
  return { data, attemptsMade, opts: { attempts } };
}

function makeSink() {
  const calls = [];
  return {
    calls,
    // default: verdict applies cleanly
    applyVerdict: jest.fn(async (patch) => { calls.push(patch); return { applied: true }; }),
  };
}

const BASE = {
  sourceService: 'timeline',
  contentType: 'post',
  contentId: 'post-1',
  userId: '11111111-1111-4111-8111-111111111111',
  contentText: 'hello world',
  contentHash: 'abc123',
  contentMetadata: {},
};

describe('processJob terminal-state ladder (ADR 0004 §4.2)', () => {
  test('GUARD FIRST: no AI provider ⇒ skipped/servable, engine NEVER called', async () => {
    const sink = makeSink();
    const moderationService = { moderateContent: jest.fn() };
    const out = await worker.processJob(makeJob(BASE), {
      logger: silentLogger,
      hasAiProvider: () => false,
      resolveSink: () => sink,
      moderationService,
    });

    expect(moderationService.moderateContent).not.toHaveBeenCalled();
    expect(out).toEqual({ status: 'skipped', reason: 'no_ai_provider' });
    expect(sink.applyVerdict).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'skipped', reason: 'no_ai_provider', contentHash: 'abc123' }),
    );
  });

  test('invalid contentType ⇒ terminal failed, engine NEVER called', async () => {
    const sink = makeSink();
    const moderationService = { moderateContent: jest.fn() };
    const out = await worker.processJob(makeJob({ ...BASE, contentType: 'bogus' }), {
      logger: silentLogger,
      hasAiProvider: () => true,
      resolveSink: () => sink,
      moderationService,
    });

    expect(moderationService.moderateContent).not.toHaveBeenCalled();
    expect(out).toEqual({ status: 'failed', reason: 'invalid_content_type' });
    expect(sink.applyVerdict).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', reason: 'invalid_content_type' }),
    );
  });

  test('clean verdict ⇒ approved (servable)', async () => {
    const sink = makeSink();
    const moderationService = {
      moderateContent: jest.fn(async () => ({
        moderationId: 'mi-1', status: 'approved', action: 'auto_approve', riskScore: 3,
        riskLevel: 'safe', requiresReview: false, scores: {},
      })),
    };
    const out = await worker.processJob(makeJob(BASE), {
      logger: silentLogger, hasAiProvider: () => true, resolveSink: () => sink, moderationService,
    });

    expect(out.status).toBe('approved');
    expect(sink.applyVerdict).toHaveBeenCalledWith(expect.objectContaining({
      status: 'approved', reason: 'clean', action: 'auto_approve',
      riskScore: 3, moderationItemId: 'mi-1', contentHash: 'abc123',
    }));
  });

  test('hard remove verdict ⇒ rejected (retract)', async () => {
    const sink = makeSink();
    const moderationService = {
      moderateContent: jest.fn(async () => ({
        moderationId: 'mi-2', status: 'rejected', action: 'remove', riskScore: 95,
        riskLevel: 'critical', requiresReview: true, scores: {},
      })),
    };
    const out = await worker.processJob(makeJob(BASE), {
      logger: silentLogger, hasAiProvider: () => true, resolveSink: () => sink, moderationService,
    });

    expect(out.status).toBe('rejected');
    expect(sink.applyVerdict).toHaveBeenCalledWith(expect.objectContaining({
      status: 'rejected', reason: 'flagged', action: 'remove',
    }));
  });

  test('fail-OPEN text: "requires review" (not a remove) stays servable=approved', async () => {
    // Content flagged for a human but not auto-removed: text was already
    // published, so it stays visible; the human decision arrives later via the
    // HTTP action sink and flips it to rejected. (ADR 0004 §5b)
    const sink = makeSink();
    const moderationService = {
      moderateContent: jest.fn(async () => ({
        moderationId: 'mi-3', status: 'reviewing', action: 'require_review', riskScore: 60,
        riskLevel: 'high', requiresReview: true, scores: {},
      })),
    };
    const out = await worker.processJob(makeJob(BASE), {
      logger: silentLogger, hasAiProvider: () => true, resolveSink: () => sink, moderationService,
    });

    expect(out.status).toBe('approved');
    expect(sink.applyVerdict).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved', action: 'require_review' }));
  });

  test('TRANSIENT error, non-final attempt ⇒ pending + attempts+1, then THROWS for retry', async () => {
    const sink = makeSink();
    const boom = new Error('scorer timeout');
    const moderationService = { moderateContent: jest.fn(async () => { throw boom; }) };

    await expect(worker.processJob(makeJob(BASE, { attemptsMade: 0, attempts: 4 }), {
      logger: silentLogger, hasAiProvider: () => true, resolveSink: () => sink, moderationService,
    })).rejects.toThrow('scorer timeout');

    expect(sink.applyVerdict).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending', reason: 'error', bumpAttempts: true, lastError: 'scorer timeout',
    }));
    // Fail-closed invariant: a transient error must NEVER write 'approved'.
    expect(sink.calls.some((c) => c.status === 'approved')).toBe(false);
  });

  test('attempts EXHAUSTED (final attempt) ⇒ writes failed (never approved) BEFORE throwing', async () => {
    const sink = makeSink();
    const boom = new Error('scorer still down');
    const moderationService = { moderateContent: jest.fn(async () => { throw boom; }) };

    await expect(worker.processJob(makeJob(BASE, { attemptsMade: 3, attempts: 4 }), {
      logger: silentLogger, hasAiProvider: () => true, resolveSink: () => sink, moderationService,
    })).rejects.toThrow('scorer still down');

    // The failed write happens BEFORE the terminal throw.
    expect(sink.applyVerdict).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed', reason: 'error', lastError: 'scorer still down',
    }));
    expect(sink.calls.some((c) => c.status === 'approved')).toBe(false);
    expect(sink.calls[sink.calls.length - 1].status).toBe('failed');
  });

  test('content changed mid-flight ⇒ sink reports superseded ⇒ verdict discarded, no throw', async () => {
    const sink = makeSink();
    sink.applyVerdict = jest.fn(async () => ({ applied: false, superseded: true }));
    const moderationService = {
      moderateContent: jest.fn(async () => ({
        moderationId: 'mi-4', status: 'approved', action: 'auto_approve', riskScore: 1, scores: {},
      })),
    };
    const out = await worker.processJob(makeJob(BASE), {
      logger: silentLogger, hasAiProvider: () => true, resolveSink: () => sink, moderationService,
    });

    expect(out).toEqual({ status: 'superseded' });
  });

  test('no sink published yet ⇒ verdict deferred, job COMPLETES (no poison loop)', async () => {
    const moderationService = {
      moderateContent: jest.fn(async () => ({
        moderationId: 'mi-5', status: 'approved', action: 'auto_approve', riskScore: 1, scores: {},
      })),
    };
    const out = await worker.processJob(makeJob(BASE), {
      logger: silentLogger, hasAiProvider: () => true, resolveSink: () => null, moderationService,
    });

    expect(out.status).toBe('approved');
    expect(out.superseded).toBe(false);
  });

  test('sink DB blip on the success path ⇒ throws so Bull retries', async () => {
    const sink = makeSink();
    sink.applyVerdict = jest.fn(async () => { throw new Error('module DB down'); });
    const moderationService = {
      moderateContent: jest.fn(async () => ({
        moderationId: 'mi-6', status: 'approved', action: 'auto_approve', riskScore: 1, scores: {},
      })),
    };
    await expect(worker.processJob(makeJob(BASE), {
      logger: silentLogger, hasAiProvider: () => true, resolveSink: () => sink, moderationService,
    })).rejects.toThrow(/sink.applyVerdict failed/);
  });
});

describe('mapVerdictToSink', () => {
  test('maps remove/reject/hide actions to rejected', () => {
    for (const action of ['reject', 'remove', 'hide']) {
      expect(worker.mapVerdictToSink({ status: 'flagged', action, riskScore: 80 }).status).toBe('rejected');
    }
  });
  test('maps status=rejected to rejected even without a remove action', () => {
    expect(worker.mapVerdictToSink({ status: 'rejected', action: 'flag', riskScore: 80 }).status).toBe('rejected');
  });
  test('everything else is approved (fail-open text)', () => {
    for (const action of ['auto_approve', 'approve', 'warn', 'flag', 'escalate', 'require_review']) {
      expect(worker.mapVerdictToSink({ status: 'flagged', action, riskScore: 40 }).status).toBe('approved');
    }
  });
});

describe('reconcileStuckPending (ADR 0004 §4.2 step 6)', () => {
  test('re-enqueues ONLY rows each sink reports as pending, tagged with sourceService', async () => {
    const submitted = [];
    const submitForModeration = jest.fn(async (p) => { submitted.push(p); return true; });

    const timelineSink = {
      applyVerdict: jest.fn(),
      listStalePending: jest.fn(async () => ([
        { contentType: 'post', contentId: 'p1', userId: 'u1', contentText: 't1', contentHash: 'h1' },
      ])),
    };
    const sparkSink = {
      applyVerdict: jest.fn(),
      listStalePending: jest.fn(async () => ([
        { contentType: 'message', contentId: 'm1', userId: 'u2', contentText: 't2', contentHash: 'h2' },
      ])),
    };

    const requeued = await worker.reconcileStuckPending({
      logger: silentLogger,
      knownSinks: () => ['timeline', 'spark', 'filevault'],
      resolveSink: (s) => ({ timeline: timelineSink, spark: sparkSink, filevault: null }[s]),
      submitForModeration,
    });

    expect(requeued).toBe(2);
    expect(submitted).toEqual([
      expect.objectContaining({ sourceService: 'timeline', contentId: 'p1', mode: 'create' }),
      expect.objectContaining({ sourceService: 'spark', contentId: 'm1', mode: 'create' }),
    ]);
  });

  test('a sink without listStalePending is skipped; a throwing sink does not abort the sweep', async () => {
    const submitForModeration = jest.fn(async () => true);
    const okSink = { applyVerdict: jest.fn(), listStalePending: jest.fn(async () => ([{ contentType: 'post', contentId: 'p9', contentHash: 'h9' }])) };
    const badSink = { applyVerdict: jest.fn(), listStalePending: jest.fn(async () => { throw new Error('boom'); }) };
    const noListSink = { applyVerdict: jest.fn() };

    const requeued = await worker.reconcileStuckPending({
      logger: silentLogger,
      knownSinks: () => ['spark', 'timeline', 'filevault'],
      resolveSink: (s) => ({ spark: badSink, timeline: okSink, filevault: noListSink }[s]),
      submitForModeration,
    });

    expect(requeued).toBe(1);
    expect(submitForModeration).toHaveBeenCalledTimes(1);
  });
});
