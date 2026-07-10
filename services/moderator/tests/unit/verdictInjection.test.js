'use strict';

/**
 * Verdict-injection guard — BUG-023.
 *
 * `moderateContent({ precomputedResult })` lets an IN-PROCESS caller (the
 * FileVault image worker) supply an already-computed verdict, skipping the AI
 * analyzer entirely. `POST /moderator/api/moderate/{content,batch}` is
 * UNAUTHENTICATED (SPIKE-001 / BUG-010).
 *
 * `/batch` originally forwarded each wire-supplied item object wholesale, so an
 * anonymous caller could forge a verdict:
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
const router = require('../../routes/moderation');

const app = express();
app.use(express.json());
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

describe('an anonymous caller cannot forge a verdict', () => {
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
