'use strict';

// Auth wiring proof for the cortex REST surface:
//   - CORTEX_ENABLED=false -> every /api/v1 route answers 503 CORTEX_DISABLED
//     (never 200, never a CA round-trip);
//   - enabled -> every /api/v1 route answers 401 MISSING_TOKEN without a
//     bearer (validateCAToken runs before any handler/DB work);
//   - /health stays public in both states.
//
// config is a singleton, so the enabled flag is flipped on the live object —
// requireEnabled reads it per-request.

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.CORTEX_ENABLED = 'false';

const request = require('supertest');
const { app } = require('../../src/index');
const config = require('../../src/config');

const ROUTES = [
  ['get', '/api/v1/models'],
  ['post', '/api/v1/tasks'],
  ['get', '/api/v1/tasks'],
  ['get', '/api/v1/tasks/task-1-abc'],
  ['get', '/api/v1/agents'],
  ['post', '/api/v1/agents'],
  ['post', '/api/v1/agents/build'],
  ['get', '/api/v1/agents/task'],
  ['delete', '/api/v1/agents/task'],
  ['post', '/api/v1/agents/task/validate'],
  ['post', '/api/v1/agents/task/enable'],
  ['post', '/api/v1/agents/task/disable'],
  ['post', '/api/v1/agents/task/smoke'],
  ['post', '/api/v1/agents/task/run'],
  ['get', '/api/v1/agents/task/runs'],
  ['get', '/api/v1/agents/task/runs/run-1-abc'],
  ['post', '/api/v1/chat'],
  ['get', '/api/v1/chat'],
  ['get', '/api/v1/chat/asst-1-abc'],
  ['post', '/api/v1/cs/chat'],
  ['get', '/api/v1/cs/chat'],
  ['post', '/api/v1/cs/email'],
  ['get', '/api/v1/outbox'],
  ['get', '/api/v1/reviews'],
  ['post', '/api/v1/reviews/rev-1-abc'],
  ['get', '/api/v1/guardrails'],
  ['post', '/api/v1/guardrails'],
  ['post', '/api/v1/guardrails/build'],
  ['delete', '/api/v1/guardrails/x'],
  ['post', '/api/v1/guardrails/x/enable'],
  ['get', '/api/v1/tools'],
  ['post', '/api/v1/tools'],
  ['post', '/api/v1/tools/x/run'],
  ['get', '/api/v1/skills'],
  ['post', '/api/v1/skills'],
  ['get', '/api/v1/prompts'],
];

describe('cortex disabled (CORTEX_ENABLED=false)', () => {
  beforeAll(() => { config.features.cortexEnabled = false; });

  test('health is public and reports enabled=false', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  test.each(ROUTES)('%s %s -> 503 CORTEX_DISABLED', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('CORTEX_DISABLED');
  });
});

describe('cortex enabled, no bearer token', () => {
  beforeAll(() => { config.features.cortexEnabled = true; });
  afterAll(() => { config.features.cortexEnabled = false; });

  test.each(ROUTES)('%s %s -> 401 MISSING_TOKEN', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('MISSING_TOKEN');
  });

  test('health still public', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });
});
