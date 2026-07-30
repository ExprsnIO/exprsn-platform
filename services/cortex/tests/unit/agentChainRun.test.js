'use strict';

/**
 * FEAT-081 — a multi-step agent executed through the real run path
 * (`jobs.runAgentRun`), with the DB, router and queue stubbed.
 *
 * `chain.test.js` proves the executor's semantics in isolation; this proves the
 * WIRING: that a spec with steps takes the chain, that a spec without steps is
 * byte-for-byte the old single-loop behaviour, that per-step results land in the
 * FEAT-080 run ledger, and that a halted chain is a completed run with a
 * withheld result rather than a crash.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.CORTEX_MODERATE = 'false';

const state = { agent: null, run: null, reviews: [] };

jest.mock('../../src/models', () => ({
  AgentTask: {},
  Agent: { findByPk: jest.fn(async () => state.agent) },
  AgentRun: { findByPk: jest.fn(async () => state.run) },
  ChatSession: {}, ChatMessage: {}, OutboxEntry: {},
  Review: { create: jest.fn(async (row) => { state.reviews.push(row); return row; }) },
}));

jest.mock('../../src/lib/promptLog', () => ({ logPrompt: jest.fn() }));
jest.mock('../../src/queues', () => ({ initQueues: jest.fn(), queues: {} }));
jest.mock('../../src/lib/cache', () => ({
  initCache: jest.fn(), chatCacheKey: () => 'k',
  cacheGet: jest.fn(async () => null), cacheSet: jest.fn(async () => {}),
}));
jest.mock('../../src/engine/agents', () => ({
  personaPrompt: jest.fn(async (k, fallback) => fallback),
  seedLegacyAgents: jest.fn(),
}));
jest.mock('../../src/engine/tools', () => ({
  ToolRegistry: class { async agentTools() { return [[], {}]; } },
}));
jest.mock('../../src/engine/skills', () => ({
  SkillRegistry: class { async promptBlock(names) { return names ? `[skills:${names}]` : ''; } },
}));

// Router transport: `simpleChat` (prompt steps) and `runAgent` (tool_loop) both
// bottom out in chatComplete.
const replies = [];
jest.mock('../../src/lib/llama', () => ({
  chatComplete: jest.fn(async () => ({
    choices: [{
      message: { role: 'assistant', content: replies.length ? replies.shift() : 'model output' },
      finish_reason: 'stop',
    }],
  })),
  chatCompleteStream: jest.fn(),
  modelSupportsImages: jest.fn(), listModels: jest.fn(),
  loadModel: jest.fn(), unloadModel: jest.fn(), routerHealth: jest.fn(),
}));

const { GuardrailEngine } = require('../../src/engine/guardrails');
let SPECS = [];
jest.spyOn(GuardrailEngine.prototype, 'enabledSpecs').mockImplementation(async () => SPECS);

const jobs = require('../../src/engine/jobs');

function makeRun(input = 'GO') {
  const row = {
    id: 'run-1', agentId: 'a-1', input, model: null, origin: 'manual',
    status: 'queued', update: jest.fn(async (v) => Object.assign(row, v)),
  };
  return row;
}

function makeAgent(spec) {
  return {
    id: 'a-1', name: 'chained', status: 'enabled',
    spec: { name: 'chained', description: 'd', system_prompt: 'SYS', channel: 'task',
            model: null, tools: null, skills: [], guardrails: null, max_iterations: 12,
            steps: [], ...spec },
  };
}

function guardrail(trigger, action = 'block') {
  return {
    name: 'test-rule', description: '', enabled: true,
    scope: ['output'], channels: ['task'], action,
    rules: [{ type: 'contains', values: [trigger], case_sensitive: false }], tests: [],
  };
}

beforeEach(() => {
  state.reviews = [];
  replies.length = 0;
  SPECS = [];
  state.run = makeRun();
});

describe('a spec WITHOUT steps keeps the classic single-loop path', () => {
  it('runs the tool loop once and stores its result', async () => {
    state.agent = makeAgent({ steps: [] });
    replies.push('single loop answer');
    const run = await jobs.runAgentRun('run-1');
    expect(run.status).toBe('done');
    expect(run.result).toBe('single loop answer');
  });
});

describe('a spec WITH steps runs the chain', () => {
  it('executes steps in order and returns the last value', async () => {
    state.agent = makeAgent({
      steps: [
        { type: 'prompt', prompt: 'draft {{input}}', as: 'draft' },
        { type: 'transform', op: 'upper', value: '{{draft}}', as: 'shout' },
      ],
    });
    replies.push('hello there');
    const run = await jobs.runAgentRun('run-1');
    expect(run.status).toBe('done');
    expect(run.result).toBe('HELLO THERE');
  });

  it('threads {{input}} and step values through the chain', async () => {
    state.agent = makeAgent({
      steps: [
        { type: 'transform', op: 'concat', values: ['in=', '{{input}}'], as: 'a' },
        { type: 'transform', op: 'concat', values: ['{{a}}', '|done'], as: 'b' },
      ],
    });
    state.run = makeRun('XYZ');
    const run = await jobs.runAgentRun('run-1');
    expect(run.result).toBe('in=XYZ|done');
  });

  it('records per-step entries in the FEAT-080 run transcript', async () => {
    state.agent = makeAgent({
      steps: [{ type: 'prompt', prompt: 'p {{input}}', as: 'a' }],
    });
    replies.push('the answer');
    const run = await jobs.runAgentRun('run-1');
    const steps = run.transcript.filter((e) => e.role === 'step');
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps[0]).toMatchObject({ step: 'steps[0]', type: 'prompt', input: 'p GO' });
    expect(steps.some((e) => e.output === 'the answer')).toBe(true);
  });

  it('runs a condition branch and records which way it went', async () => {
    state.agent = makeAgent({
      steps: [{
        type: 'condition', op: 'contains', when: '{{input}}', value: 'YES',
        then: [{ type: 'transform', op: 'upper', value: 'took-then' }],
        else: [{ type: 'transform', op: 'upper', value: 'took-else' }],
      }],
    });
    state.run = makeRun('YES please');
    const run = await jobs.runAgentRun('run-1');
    expect(run.result).toBe('TOOK-THEN');
    expect(run.transcript.find((e) => e.type === 'condition').branch).toBe('then');
  });

  it('a retrieve step degrades to empty and does not stop the run', async () => {
    state.agent = makeAgent({
      steps: [
        { type: 'retrieve', query: '{{input}}', as: 'chunks' },
        { type: 'transform', op: 'concat', values: ['[', '{{chunks}}', ']'], as: 'out' },
      ],
    });
    const run = await jobs.runAgentRun('run-1');
    expect(run.status).toBe('done');
    expect(run.result).toBe('[]');
  });
});

describe('guardrails on a chained run', () => {
  it('screens each model-producing step and halts on a block', async () => {
    SPECS = [guardrail('forbidden')];
    state.agent = makeAgent({
      steps: [
        { type: 'prompt', prompt: 'first', as: 'a' },
        { type: 'prompt', prompt: 'second', as: 'b' },
      ],
    });
    replies.push('this is forbidden text', 'never reached');
    const run = await jobs.runAgentRun('run-1');

    expect(run.status).toBe('done');           // a halt is a completed run…
    expect(run.result).toMatch(/^Result withheld:/); // …with a withheld result
    expect(run.result).not.toContain('forbidden text');
  });

  it('names the halting step in the transcript', async () => {
    SPECS = [guardrail('nope')];
    state.agent = makeAgent({ steps: [{ type: 'prompt', prompt: 'p', as: 'a' }] });
    replies.push('contains nope here');
    const run = await jobs.runAgentRun('run-1');
    expect(run.transcript.some((e) => e.role === 'system' && e.step === 'steps[0]')).toBe(true);
  });

  it('files a Review and holds the result when a step escalates', async () => {
    SPECS = [guardrail('reviewme', 'escalate')];
    state.agent = makeAgent({ steps: [{ type: 'prompt', prompt: 'p', as: 'a' }] });
    replies.push('please reviewme now');
    const run = await jobs.runAgentRun('run-1');

    expect(state.reviews).toHaveLength(1);
    expect(state.reviews[0].kind).toBe('agent_step');
    expect(state.reviews[0].sessionId).toBe('run-1');
    expect(run.result).toMatch(/^Held for human review:/);
  });

  it('an explicit guardrail step blocks on its named rule', async () => {
    SPECS = [guardrail('badword')];
    state.agent = makeAgent({
      steps: [
        { type: 'transform', op: 'trim', value: '  badword inside  ', as: 'v' },
        { type: 'guardrail', guardrails: ['test-rule'], value: '{{v}}' },
        { type: 'transform', op: 'upper', value: 'should-not-run' },
      ],
    });
    const run = await jobs.runAgentRun('run-1');
    expect(run.result).toMatch(/^Result withheld:/);
    expect(run.result).not.toContain('SHOULD-NOT-RUN');
  });

  it('a guardrail step with on_fail=continue does not stop the chain', async () => {
    SPECS = [guardrail('meh')];
    state.agent = makeAgent({
      steps: [
        { type: 'transform', op: 'trim', value: 'meh', as: 'v' },
        { type: 'guardrail', guardrails: ['test-rule'], value: '{{v}}', on_fail: 'continue' },
        { type: 'transform', op: 'upper', value: 'finished' },
      ],
    });
    const run = await jobs.runAgentRun('run-1');
    expect(run.result).toBe('FINISHED');
  });
});

describe('failure handling', () => {
  it('a thrown step failure marks the run failed, not silently done', async () => {
    const llama = require('../../src/lib/llama');
    llama.chatComplete.mockRejectedValueOnce(new Error('router down'));
    state.agent = makeAgent({ steps: [{ type: 'prompt', prompt: 'p' }] });
    const run = await jobs.runAgentRun('run-1');
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/router down/);
  });

  it('a missing agent row fails the run cleanly', async () => {
    const { Agent } = require('../../src/models');
    Agent.findByPk.mockResolvedValueOnce(null);
    const run = await jobs.runAgentRun('run-1');
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/agent no longer exists/);
  });
});
