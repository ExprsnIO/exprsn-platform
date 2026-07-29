'use strict';

// TASK-062 — inbound service-token HMAC auth on designated cortex routes.
//
//   - a valid X-Service-ID/X-Service-Token pair (HMAC-SHA256(serviceId,
//     SERVICE_TOKEN_SECRET)) is accepted IN LIEU OF a CA bearer on the tasks
//     routes;
//   - invalid or partial service headers => 401 (and NEVER fall through to
//     the CA path — a bad service credential must not get a second chance);
//   - requests with no service headers keep the CA-bearer behavior
//     (401 MISSING_TOKEN without a bearer) — regression for the existing path;
//   - non-designated routes (e.g. registry mutations) do not accept service
//     auth at all.
//
// Models and the job queue are mocked so no Postgres/Redis is needed:
// a request that passes auth reaches the handler and answers from the mocks.

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.CORTEX_ENABLED = 'true';
process.env.SERVICE_TOKEN_SECRET =
  'test-service-secret-0123456789abcdef0123456789abcdef';
delete process.env.SERVICE_TOKEN_LEGACY_ALLOW;

jest.mock('../../src/models', () => ({
  sequelize: {},
  Guardrail: {}, Skill: {}, Tool: {},
  AgentTask: {
    create: jest.fn(async (row) => ({ ...row })),
    findAll: jest.fn(async () => []),
    findByPk: jest.fn(async () => null),
  },
  Agent: {}, AgentRun: {},
  ChatSession: {}, ChatMessage: {}, OutboxEntry: {}, Review: {}, PromptLog: {},
}));
jest.mock('../../src/engine/jobs', () => ({
  queueTask: jest.fn(async () => {}),
  queueAgentRun: jest.fn(async () => {}),
  assistantChatTurn: jest.fn(),
  csChatTurn: jest.fn(),
  csEmail: jest.fn(),
  resolveReview: jest.fn(),
  TOOLS: { loadAll: async () => [] },
  SKILLS: { loadAll: async () => [] },
  ENGINE: { loadAll: async () => [] },
}));

const request = require('supertest');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const { app } = require('../../src/index');
const config = require('../../src/config');
const { AgentTask } = require('../../src/models');

beforeAll(() => { config.features.cortexEnabled = true; });
afterAll(() => { config.features.cortexEnabled = false; });

const SERVICE_ID = 'timeline';
const serviceHeaders = () => ({
  'X-Service-ID': SERVICE_ID,
  'X-Service-Token': deriveServiceToken(SERVICE_ID),
});

describe('TASK-062 — service HMAC accepted on designated routes', () => {
  test('POST /api/v1/tasks with a valid service HMAC passes auth and creates', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .set(serviceHeaders())
      .send({ goal: 'service-enqueued goal' });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('queued');
    // Service callers carry no user identity.
    expect(AgentTask.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null }));
  });

  test('GET /api/v1/tasks with a valid service HMAC passes auth', async () => {
    const res = await request(app).get('/api/v1/tasks').set(serviceHeaders());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tasks: [] });
  });

  test('bad service token => 401 INVALID_SERVICE_TOKEN (no CA fallback)', async () => {
    const res = await request(app)
      .get('/api/v1/tasks')
      .set({ 'X-Service-ID': SERVICE_ID, 'X-Service-Token': 'f'.repeat(64) });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_SERVICE_TOKEN');
  });

  test('token bound to another service id => 401', async () => {
    const res = await request(app)
      .get('/api/v1/tasks')
      .set({ 'X-Service-ID': 'spark', 'X-Service-Token': deriveServiceToken(SERVICE_ID) });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_SERVICE_TOKEN');
  });

  test('partial service headers => 401 MISSING_SERVICE_CREDENTIALS', async () => {
    const res = await request(app)
      .get('/api/v1/tasks')
      .set({ 'X-Service-ID': SERVICE_ID });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('MISSING_SERVICE_CREDENTIALS');
  });

  test('no service headers => CA path unchanged (401 MISSING_TOKEN)', async () => {
    const res = await request(app).get('/api/v1/tasks');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('MISSING_TOKEN');
  });
});

describe('TASK-062 — non-designated routes reject service auth', () => {
  test.each([
    ['post', '/api/v1/guardrails'],
    ['post', '/api/v1/tools'],
    ['get', '/api/v1/reviews'],
    ['get', '/api/v1/prompts'],
    ['post', '/api/v1/chat'],
  ])('%s %s with a valid service HMAC still requires a CA bearer', async (method, path) => {
    const res = await request(app)[method](path).set(serviceHeaders());
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('MISSING_TOKEN');
  });
});
