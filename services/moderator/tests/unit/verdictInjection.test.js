'use strict';

/**
 * Verdict-injection guard — BUG-023.
 *
 * `moderateContent({ precomputedResult })` lets an IN-PROCESS caller (the
 * FileVault image worker) supply an already-computed verdict, skipping the AI
 * analyzer entirely. `POST /moderator/api/moderate/{content,batch}` is now
 * requireService-gated (HMAC service token — BUG-010 / SPIKE-001), so these
 * tests present a valid service token. The strict field allowlist below is the
 * SECOND line of defense (defense-in-depth): a valid-but-legacy/misconfigured
 * or compromised service token that passes the gate still must not be able to
 * forge a verdict.
 *
 * `/batch` originally forwarded each wire-supplied item object wholesale, so a
 * caller that reached the handler could forge a verdict:
 *
 *   POST /api/moderate/batch
 *   { "items": [{ ..., "precomputedResult": { "riskScore": 0 } }] }
 *
 * and have it persist verbatim. Worse, `moderateContent` dedups on
 * (sourceService, contentType, contentId), so a forged verdict is STICKY — it
 * pre-empts the real moderation that would have happened later. Either launder
 * content as clean (riskScore 0) or grief a target into the review queue
 * (riskScore 100).
 *
 * These tests attack the actual route handlers. They must not be softened into
 * source-code greps: the earlier version of this file only asserted that
 * `/content` didn't mention the field, and missed `/batch` entirely.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

// A valid (non-placeholder, >=32 char) service secret so deriveServiceToken /
// verifyServiceToken agree on the HMAC in this process — the moderate routes
// are requireService-gated (BUG-010). Must be set BEFORE the shared token util
// (required transitively via routes/moderation) reads it.
process.env.SERVICE_TOKEN_SECRET =
  process.env.SERVICE_TOKEN_SECRET ||
  'a0b1c2d3e4f5061728394a5b6c7d8e9f00112233445566778899aabbccddeeff';
process.env.SERVICE_ID = 'platform';

const mockSeen = [];
jest.mock('../../services/moderationService', () => ({
  moderateContent: jest.fn(async (params) => {
    mockSeen.push(params);
    return { moderationId: 'm1', status: 'approved' };
  }),
}));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const router = require('../../routes/moderation');

const SERVICE_TOKEN = deriveServiceToken('platform');

const app = express();
app.use(express.json());
// Present a valid service token on every request: this suite exercises the
// allowlist (defense-in-depth), not the requireService gate itself — the gate
// is covered by tests/integration/authGating.test.js.
app.use((req, _res, next) => {
  req.headers['x-service-id'] = 'platform';
  req.headers['x-service-token'] = SERVICE_TOKEN;
  next();
});
app.use('/api/moderate', router);

const FORGED = { riskScore: 0, nsfwScore: 0, provider: 'cortex', flags: [] };
const base = {
  contentType: 'image',
  contentId: 'victim-file',
  sourceService: 'filevault',
  userId: '11111111-1111-4111-8111-111111111111',
  contentText: 'anything',
};

beforeEach(() => { mockSeen.length = 0; });

describe('a service caller that reaches the handler cannot forge a verdict', () => {
  test('POST /content strips precomputedResult', async () => {
    await request(app).post('/api/moderate/content')
      .send({ ...base, precomputedResult: FORGED })
      .expect(200);

    expect(mockSeen).toHaveLength(1);
    expect(mockSeen[0].precomputedResult).toBeUndefined();
  });

  // The hole the first pass missed: /batch forwarded each item object wholesale.
  test('POST /batch strips precomputedResult from EVERY item', async () => {
    await request(app).post('/api/moderate/batch')
      .send({ items: [
        { ...base, contentId: 'a' },
        { ...base, contentId: 'b', precomputedResult: FORGED },
        { ...base, contentId: 'c', precomputedResult: { riskScore: 100 } },
      ] })
      .expect(200);

    expect(mockSeen).toHaveLength(3);
    for (const params of mockSeen) {
      expect(params.precomputedResult).toBeUndefined();
    }
  });

  test('no unexpected wire field reaches the service (strict allowlist, not a denylist)', async () => {
    await request(app).post('/api/moderate/content')
      .send({ ...base, precomputedResult: FORGED, someFutureVerdictField: FORGED, __proto__: {} })
      .expect(200);

    const allowed = [
      'contentType', 'contentId', 'sourceService', 'userId',
      'contentText', 'contentUrl', 'contentMetadata', 'aiProvider',
    ];
    expect(Object.keys(mockSeen[0]).sort()).toEqual(allowed.sort());
  });

  test('the legitimate fields still get through', async () => {
    await request(app).post('/api/moderate/content')
      .send({ ...base, aiProvider: 'deepseek', contentMetadata: { k: 1 } })
      .expect(200);

    expect(mockSeen[0]).toMatchObject({
      contentType: 'image', contentId: 'victim-file', aiProvider: 'deepseek',
      contentMetadata: { k: 1 },
    });
  });
});

// The shapes I'd normally reach for a wire allowlist bypass — the same ones I
// asked QA to try. A strict destructure defeats all of them, but pin it.
describe('adversarial injection shapes', () => {
  test('the forged field buried at item[47] of a large batch is still stripped', async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ ...base, contentId: `c${i}` }));
    items[47].precomputedResult = FORGED;
    await request(app).post('/api/moderate/batch').send({ items }).expect(200);

    expect(mockSeen).toHaveLength(50);
    expect(mockSeen.every((p) => p.precomputedResult === undefined)).toBe(true);
  });

  test('a __proto__-carried verdict neither passes through nor pollutes Object.prototype', async () => {
    const payload = `{"contentType":"image","contentId":"p","sourceService":"s",` +
      `"userId":"u","contentText":"t","__proto__":{"precomputedResult":${JSON.stringify(FORGED)}}}`;
    await request(app).post('/api/moderate/content')
      .set('Content-Type', 'application/json').send(payload).expect(200);

    expect(mockSeen[0].precomputedResult).toBeUndefined();
    expect({}.precomputedResult).toBeUndefined(); // prototype not polluted
  });

  test('a verdict nested in contentMetadata is inert (the service reads params.precomputedResult only)', async () => {
    await request(app).post('/api/moderate/content')
      .send({ ...base, contentMetadata: { precomputedResult: FORGED } })
      .expect(200);

    // It may ride along inside contentMetadata (that's just opaque metadata), but
    // it is NOT the top-level precomputedResult the service acts on.
    expect(mockSeen[0].precomputedResult).toBeUndefined();
  });

  // Regression: a `null`/non-object item used to throw inside the destructure
  // and 500 the WHOLE batch (one malformed item denies service to all 100). And
  // the FIRST version of this test asserted `status < 600` — which a 500
  // satisfies, so it passed on the bug. Assert the real contract instead.
  test('a malformed batch item is a clean 400, never a 500', async () => {
    const res = await request(app).post('/api/moderate/batch')
      .send({ items: [{ ...base, contentId: 'good' }, null, 'nope', 42] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
    // nothing was moderated — the batch was rejected wholesale
    expect(mockSeen).toHaveLength(0);
  });

  test('a batch item missing required fields is rejected, not moderated as garbage', async () => {
    const res = await request(app).post('/api/moderate/batch')
      .send({ items: [{ ...base }, { contentText: 'orphan with no ids' }] });
    expect(res.status).toBe(400);
    expect(mockSeen).toHaveLength(0);
  });

  test('a fully valid batch still processes every item', async () => {
    await request(app).post('/api/moderate/batch')
      .send({ items: [{ ...base, contentId: 'a' }, { ...base, contentId: 'b' }] })
      .expect(200);
    expect(mockSeen).toHaveLength(2);
  });
});
