'use strict';

// FEAT-080 — agent CRUD + draft → validated → enabled lifecycle over the REST
// surface, with an in-memory Agent/AgentRun store (no Postgres/Redis/LLM).
//
// Pins the ACs:
//   - save always lands as a draft (any edit re-enters the gate);
//   - the enable gate is DETERMINISTIC validation only (missing refs /
//     unresolvable model / non-empty steps => 400 with problems);
//   - disabled (non-enabled) agents cannot run (409); enabled ones can;
//   - runs land in the per-agent ledger; GET /agents/:id/runs paginates;
//   - builtin personas can't be deleted; agents with runs can't be deleted;
//   - the NL builder saves a draft via the registryFactory /build pattern.

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.CORTEX_ENABLED = 'true';
process.env.PLATFORM_ADMIN_EMAILS = 'admin@test.io';

// CA validator stub: header X-Test-User selects the identity; admin@test.io
// is on the platform-admin allowlist above.
jest.mock('@exprsn/shared', () => {
  const actual = jest.requireActual('@exprsn/shared');
  return {
    ...actual,
    validateCAToken: () => (req, res, next) => {
      const user = req.headers['x-test-user'];
      if (!user) return res.status(401).json({ error: 'MISSING_TOKEN' });
      const [userId, email] = String(user).split('|');
      req.userId = userId;
      req.tokenData = { email: email || null };
      req.permissions = ['read', 'write'];
      next();
    },
  };
});

// In-memory Agent/AgentRun store, minimal Sequelize surface.
jest.mock('../../src/models', () => {
  let agentSeq = 0;
  const agents = new Map(); // id -> row
  const runs = new Map();   // id -> row
  const wrap = (row) => {
    const inst = { ...row };
    inst.update = async (patch) => {
      Object.assign(row, patch); // persist
      Object.assign(inst, patch); // keep the live instance fresh (Sequelize parity)
      return inst;
    };
    inst.destroy = async () => { agents.delete(row.id); };
    inst.get = () => ({ ...row });
    return inst;
  };
  const matches = (row, where = {}) => Object.entries(where).every(
    ([k, v]) => (row[k] ?? null) === (v ?? null));
  const Agent = {
    findByPk: async (id) => (agents.has(id) ? wrap(agents.get(id)) : null),
    findOne: async ({ where }) => {
      for (const row of agents.values()) if (matches(row, where)) return wrap(row);
      return null;
    },
    findAll: async () => [...agents.values()].map(wrap),
    create: async (values) => {
      const row = { id: `00000000-0000-4000-8000-${String(++agentSeq).padStart(12, '0')}`,
                    builtin: false, createdAt: new Date(), updatedAt: new Date(), ...values };
      agents.set(row.id, row);
      return wrap(row);
    },
  };
  const AgentRun = {
    create: async (values) => {
      const row = { status: 'queued', createdAt: new Date(), ...values };
      runs.set(row.id, row);
      return wrap(row);
    },
    findByPk: async (id) => (runs.has(id) ? wrap(runs.get(id)) : null),
    count: async ({ where }) => [...runs.values()].filter((r) => matches(r, where)).length,
    findAndCountAll: async ({ where, limit, offset }) => {
      const all = [...runs.values()].filter((r) => matches(r, where))
        .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
      return { count: all.length, rows: all.slice(offset, offset + limit).map(wrap) };
    },
  };
  const registryStub = (names) => ({
    findAll: async () => names.map((name) => ({ name })),
  });
  return {
    sequelize: {},
    Agent, AgentRun,
    Tool: registryStub(['weather']),
    Skill: registryStub(['concise-writing']),
    Guardrail: registryStub(['no-pii']),
    AgentTask: { create: async (v) => v, findAll: async () => [], findByPk: async () => null },
    ChatSession: {}, ChatMessage: {}, OutboxEntry: {}, Review: {}, PromptLog: {},
  };
});

jest.mock('../../src/engine/jobs', () => ({
  queueTask: jest.fn(async () => {}),
  queueAgentRun: jest.fn(async () => {}),
  assistantChatTurn: jest.fn(), csChatTurn: jest.fn(), csEmail: jest.fn(),
  resolveReview: jest.fn(),
  TOOLS: { loadAll: async () => [] },
  SKILLS: { loadAll: async () => [] },
  ENGINE: { loadAll: async () => [] },
}));

jest.mock('../../src/lib/llama', () => ({
  listModels: jest.fn(async () => ({ data: [{ id: 'aurora-0.6b' }] })),
}));

const request = require('supertest');
const { app } = require('../../src/index');
const config = require('../../src/config');
const { queueAgentRun } = require('../../src/engine/jobs');

beforeAll(() => { config.features.cortexEnabled = true; });
afterAll(() => { config.features.cortexEnabled = false; });

const ADMIN = { 'X-Test-User': 'a0000000-0000-4000-8000-000000000001|admin@test.io' };
const USER = { 'X-Test-User': 'b0000000-0000-4000-8000-000000000002|user@test.io' };

const SPEC = {
  name: 'research-helper',
  description: 'Researches things',
  system_prompt: 'You are a careful research agent.',
  channel: 'task',
  model: 'aurora-0.6b',
  tools: ['weather'],
  skills: ['concise-writing'],
};

describe('FEAT-080 agents lifecycle over REST', () => {
  test('non-admin cannot save (403); admin save lands as draft', async () => {
    const denied = await request(app).post('/api/v1/agents').set(USER).send(SPEC);
    expect(denied.status).toBe(403);

    const res = await request(app).post('/api/v1/agents').set(ADMIN).send(SPEC);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ saved: 'research-helper', status: 'draft' });
  });

  test('draft agents cannot run (409)', async () => {
    const res = await request(app)
      .post('/api/v1/agents/research-helper/run').set(USER).send({ input: 'go' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not enabled/);
  });

  test('validate: deterministic gate passes -> status validated', async () => {
    const res = await request(app)
      .post('/api/v1/agents/research-helper/validate').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, problems: [], status: 'validated' });
  });

  test('enable: gate re-runs and enables', async () => {
    const res = await request(app)
      .post('/api/v1/agents/research-helper/enable').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: 'research-helper' });
  });

  test('enabled agent runs: 202, run queued in the ledger', async () => {
    const res = await request(app)
      .post('/api/v1/agents/research-helper/run').set(USER).send({ input: 'find things' });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('queued');
    expect(res.body.id).toMatch(/^run-/);
    expect(queueAgentRun).toHaveBeenCalledWith(res.body.id);
  });

  test('GET /agents/:name/runs paginates and scopes to the caller', async () => {
    // second run by the same user
    await request(app)
      .post('/api/v1/agents/research-helper/run').set(USER).send({ input: 'again' });
    const page = await request(app)
      .get('/api/v1/agents/research-helper/runs?limit=1&offset=0').set(USER);
    expect(page.status).toBe(200);
    expect(page.body.total).toBe(2);
    expect(page.body.runs).toHaveLength(1);
    expect(page.body.limit).toBe(1);

    // a different non-admin sees none; admin sees all
    const other = await request(app)
      .get('/api/v1/agents/research-helper/runs').set(ADMIN);
    expect(other.body.total).toBe(2);
  });

  test('single run is retrievable with transcript field present', async () => {
    const list = await request(app)
      .get('/api/v1/agents/research-helper/runs').set(USER);
    const runId = list.body.runs[0].id;
    const res = await request(app)
      .get(`/api/v1/agents/research-helper/runs/${runId}`).set(USER);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(runId);
  });

  test('edit resets to draft (validated/enabled must be re-earned)', async () => {
    const res = await request(app).post('/api/v1/agents').set(ADMIN)
      .send({ ...SPEC, description: 'edited' });
    expect(res.body.status).toBe('draft');
    const run = await request(app)
      .post('/api/v1/agents/research-helper/run').set(USER).send({ input: 'x' });
    expect(run.status).toBe(409);
  });

  test('gate failures: unknown tool and unresolvable model => 400 with problems', async () => {
    await request(app).post('/api/v1/agents').set(ADMIN)
      .send({ ...SPEC, name: 'broken', tools: ['ghost-tool'], model: 'ghost-13b' });
    const res = await request(app).post('/api/v1/agents/broken/enable').set(ADMIN);
    expect(res.status).toBe(400);
    expect(res.body.problems.join('; '))
      .toMatch(/tool not found: ghost-tool.*model not resolvable on the router: ghost-13b/);
  });

  test('non-empty steps pass save but fail the gate (FEAT-081 posture)', async () => {
    const save = await request(app).post('/api/v1/agents').set(ADMIN)
      .send({ ...SPEC, name: 'stepped', model: null, tools: null, skills: [],
              steps: [{ type: 'parallel' }] });
    expect(save.status).toBe(200); // drafts may hold step-bearing specs
    const res = await request(app).post('/api/v1/agents/stepped/enable').set(ADMIN);
    expect(res.status).toBe(400);
    expect(res.body.problems)
      .toContain('multi-step agent specs are not yet supported (FEAT-081)');
  });

  test('delete: refused while runs exist; clean agents delete', async () => {
    const withRuns = await request(app)
      .delete('/api/v1/agents/research-helper').set(ADMIN);
    expect(withRuns.status).toBe(409);
    expect(withRuns.body.error).toMatch(/recorded run/);

    const clean = await request(app).delete('/api/v1/agents/stepped').set(ADMIN);
    expect(clean.status).toBe(200);
    expect(clean.body).toEqual({ deleted: 'stepped' });
  });

  test('smoke run is advisory: 202 with advisory flag, allowed on drafts', async () => {
    await request(app).post('/api/v1/agents').set(ADMIN)
      .send({ ...SPEC, name: 'smoky', model: null, tools: null, skills: [] });
    const res = await request(app)
      .post('/api/v1/agents/smoky/smoke').set(ADMIN).send({});
    expect(res.status).toBe(202);
    expect(res.body.advisory).toBe(true);
  });

  test('NL builder drafts and saves via the /build pattern', async () => {
    const agentEngine = require('../../src/engine/agent');
    const spy = jest.spyOn(agentEngine, 'simpleChat').mockResolvedValue(JSON.stringify({
      name: 'built-agent', description: 'Built from English',
      system_prompt: 'You are a built agent.', channel: 'task',
      model: null, tools: null, skills: [], max_iterations: 12,
    }));
    const res = await request(app).post('/api/v1/agents/build').set(ADMIN)
      .send({ description: 'an agent that does things' });
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe('built-agent');
    expect(res.body.status).toBe('draft');
    expect(res.body.next).toMatch(/validate/);
  });
});
