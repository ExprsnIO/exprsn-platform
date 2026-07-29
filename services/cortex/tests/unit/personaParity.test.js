'use strict';

// FEAT-080 — persona-parity regression (an explicit AC artifact).
//
// The 3 legacy hard-coded personas (engine/agent.js) are seeded as agent
// rows. Parity is structural — the seed specs embed the SAME constants the
// flow layer falls back to — and this suite pins it:
//   1. seed spec text === legacy constant, byte for byte;
//   2. every seed passes the deterministic gate OFFLINE (model null, no
//      refs) — i.e. seeding can never be special-cased past the gate;
//   3. personaPrompt prefers an ENABLED DB row and falls back to the legacy
//      constant when the row is missing/disabled/broken — so existing flows
//      keep working in every state.

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

jest.mock('../../src/models', () => ({
  sequelize: {},
  Agent: { findOne: jest.fn(), findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  AgentRun: {},
  Guardrail: {}, Skill: {}, Tool: {}, AgentTask: {},
  ChatSession: {}, ChatMessage: {}, OutboxEntry: {}, Review: {}, PromptLog: {},
}));

const agent = require('../../src/engine/agent');
const { PERSONAS, gateProblems, personaPrompt } = require('../../src/engine/agents');
const { Agent } = require('../../src/models');

const byName = Object.fromEntries(PERSONAS.map((p) => [p.name, p]));

describe('persona parity — seed specs vs legacy constants', () => {
  test('exactly the 3 legacy personas are seeded', () => {
    expect(PERSONAS.map((p) => p.name).sort()).toEqual(['assistant', 'cs', 'task']);
  });

  test.each([
    ['task', 'TASK_SYSTEM', 'task'],
    ['assistant', 'CHAT_SYSTEM', 'chat'],
    ['cs', 'CS_SYSTEM', 'cs_chat'],
  ])("persona '%s' prompt === agent.%s and channel is '%s'", (name, constant, channel) => {
    expect(byName[name].system_prompt).toBe(agent[constant]);
    expect(byName[name].channel).toBe(channel);
  });

  test('every persona passes the deterministic gate OFFLINE (no router, no refs)', () => {
    const EMPTY = { toolNames: new Set(), skillNames: new Set(),
                    guardrailNames: new Set(), modelIds: null };
    for (const p of PERSONAS) {
      expect(gateProblems(p, EMPTY)).toEqual([]);
      expect(p.model).toBeNull(); // null model = brain model — the offline guarantee
      expect(p.steps).toEqual([]);
    }
  });
});

describe('personaPrompt — DB row wins, legacy constant is the safety net', () => {
  afterEach(() => jest.clearAllMocks());

  test('an ENABLED row overrides the constant', async () => {
    Agent.findOne.mockResolvedValue({ spec: { system_prompt: 'custom persona text' } });
    await expect(personaPrompt('assistant', agent.CHAT_SYSTEM))
      .resolves.toBe('custom persona text');
    expect(Agent.findOne).toHaveBeenCalledWith(
      { where: { name: 'assistant', status: 'enabled' } });
  });

  test('no enabled row => legacy constant (flows keep working)', async () => {
    Agent.findOne.mockResolvedValue(null);
    await expect(personaPrompt('task', agent.TASK_SYSTEM))
      .resolves.toBe(agent.TASK_SYSTEM);
  });

  test('blank/broken row prompt => legacy constant', async () => {
    Agent.findOne.mockResolvedValue({ spec: { system_prompt: '   ' } });
    await expect(personaPrompt('cs', agent.CS_SYSTEM)).resolves.toBe(agent.CS_SYSTEM);
  });

  test('DB error => legacy constant (an interactive turn never fails on the lookup)', async () => {
    Agent.findOne.mockRejectedValue(new Error('db down'));
    await expect(personaPrompt('task', agent.TASK_SYSTEM))
      .resolves.toBe(agent.TASK_SYSTEM);
  });
});

describe('csSystemPrompt base swap', () => {
  test('accepts a custom base and keeps the default', () => {
    // No KB dir in the test env — the prompt is just the base text.
    expect(agent.csSystemPrompt()).toContain(agent.CS_SYSTEM);
    expect(agent.csSystemPrompt('CUSTOM CS PERSONA')).toContain('CUSTOM CS PERSONA');
  });
});
