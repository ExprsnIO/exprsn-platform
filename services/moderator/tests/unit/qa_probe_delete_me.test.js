'use strict';

// QA throwaway probe — extra injection shapes for BUG-023 re-verification.
// Drives the REAL committed route handlers; records exactly what the service sees.

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const seen = [];
jest.mock('../../services/moderationService', () => ({
  moderateContent: jest.fn(async (params) => {
    seen.push(params);
    return { moderationId: 'm', status: 'approved' };
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

beforeEach(() => { seen.length = 0; });

const svc = () => require('../../services/moderationService').moderateContent;

describe('QA extra injection shapes', () => {
  test('top-level precomputedResult stripped on /content', async () => {
    await request(app).post('/api/moderate/content').send({
      contentType: 'text', contentId: 'a', sourceService: 's', userId: 'u',
      contentText: 'hi', precomputedResult: { riskScore: 0 },
    });
    expect(svc()).toHaveBeenCalled();
    expect(seen[0]).not.toHaveProperty('precomputedResult');
  });

  test('nested precomputedResult inside contentMetadata is inert (service reads only top-level)', async () => {
    await request(app).post('/api/moderate/content').send({
      contentType: 'text', contentId: 'b', sourceService: 's', userId: 'u',
      contentText: 'hi', contentMetadata: { precomputedResult: { riskScore: 0 } },
    });
    // contentMetadata passes through (allowlisted), but the service destructures
    // precomputedResult from the TOP level of params only — never from metadata.
    expect(seen[0].precomputedResult).toBeUndefined();
  });

  test('prototype-pollution style keys do not deliver a verdict', async () => {
    await request(app).post('/api/moderate/content')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({
        contentType: 'text', contentId: 'c', sourceService: 's', userId: 'u',
        contentText: 'hi', __proto__: { precomputedResult: { riskScore: 0 } },
      }));
    expect(seen[0].precomputedResult).toBeUndefined();
    expect(({}).precomputedResult).toBeUndefined(); // global proto not polluted
  });

  test('/batch: sparse array where only item[47] carries the field', async () => {
    const items = [];
    for (let i = 0; i < 60; i++) {
      items.push({ contentType: 'text', contentId: `x${i}`, sourceService: 's', userId: 'u', contentText: 'hi' });
    }
    items[47].precomputedResult = { riskScore: 0, nsfwScore: 100 };
    await request(app).post('/api/moderate/batch').send({ items });
    const forged = seen.filter((p) => p && p.precomputedResult !== undefined);
    expect(forged).toHaveLength(0);
  });

  test('/batch: string and null items', async () => {
    const res = await request(app).post('/api/moderate/batch').send({
      items: ['a-plain-string', { contentType: 'text', contentId: 'ok', sourceService: 's', userId: 'u' }],
    });
    // string item must not deliver a verdict; capture whether null crashes the batch
    const forged = seen.filter((p) => p && p.precomputedResult !== undefined);
    expect(forged).toHaveLength(0);
    // record the null-item behaviour explicitly
    const resNull = await request(app).post('/api/moderate/batch').send({
      items: [null, { contentType: 'text', contentId: 'ok2', sourceService: 's', userId: 'u' }],
    });
    // eslint-disable-next-line no-console
    console.log('NULL_ITEM_STATUS', resNull.status);
    console.log('STRING_ITEM_STATUS', res.status);
  });
});
