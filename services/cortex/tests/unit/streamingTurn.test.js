'use strict';

/**
 * FEAT-090 — `assistantChatTurn` with a streaming sink, end to end through the
 * guard (models, guardrail specs and the router transport all stubbed).
 *
 * This is the suite that proves the WIRING, as opposed to `streamGuard.test.js`
 * which proves the guard in isolation: that the turn releases only screened
 * text, that a halting verdict still produces the same persisted status and the
 * same canned reply as the non-streaming path, and that a streaming client and
 * a buffered client observe the same final answer.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.CORTEX_MODERATE = 'false';

const created = { messages: [], reviews: [] };

jest.mock('../../src/models', () => ({
  AgentTask: {}, Agent: {}, AgentRun: {},
  ChatSession: {
    findByPk: jest.fn(async () => ({
      id: 'asst-1', channel: 'assistant', skills: [], model: null, userId: null,
      update: jest.fn(),
    })),
    create: jest.fn(),
  },
  ChatMessage: {
    create: jest.fn(async (row) => { created.messages.push(row); }),
    findAll: jest.fn(async () => []),
  },
  OutboxEntry: {},
  Review: { create: jest.fn(async (row) => { created.reviews.push(row); }) },
}));

jest.mock('../../src/lib/promptLog', () => ({ logPrompt: jest.fn() }));
jest.mock('../../src/queues', () => ({ initQueues: jest.fn(), queues: {} }));
jest.mock('../../src/lib/cache', () => ({
  initCache: jest.fn(),
  chatCacheKey: () => 'k',
  cacheGet: jest.fn(async () => null),
  cacheSet: jest.fn(async () => {}),
}));
jest.mock('../../src/engine/agents', () => ({
  personaPrompt: jest.fn(async (kind, fallback) => fallback),
  seedLegacyAgents: jest.fn(),
}));

// No custom tools/skills — keeps the registries off the DB. With no tool
// schemas the agent loop takes its no-tools path, which is the shape an
// assistant turn ends on anyway.
jest.mock('../../src/engine/tools', () => ({
  ToolRegistry: class { async agentTools() { return [[], {}]; } },
}));
jest.mock('../../src/engine/skills', () => ({
  SkillRegistry: class { async promptBlock() { return ''; } },
}));

// The router transport: emit scripted deltas, one per call to chatCompleteStream.
const script = { deltas: [], aborted: false };
jest.mock('../../src/lib/llama', () => ({
  // The buffered twin returns the same generation, so the two paths can be
  // compared directly.
  chatComplete: jest.fn(async () => ({
    choices: [{ message: { role: 'assistant', content: script.deltas.join('') }, finish_reason: 'stop' }],
  })),
  chatCompleteStream: jest.fn(async (model, messages, opts, { signal, onDelta } = {}) => {
    for (const d of script.deltas) {
      if (signal && signal.aborted) { script.aborted = true; break; }
      if (onDelta) onDelta({ content: d });
      // let the guard's async screening settle between deltas
      await new Promise((r) => setImmediate(r));
    }
    return { text: script.deltas.join(''), finishReason: 'stop', toolCalls: [] };
  }),
  modelSupportsImages: jest.fn(),
  listModels: jest.fn(),
  loadModel: jest.fn(),
  unloadModel: jest.fn(),
  routerHealth: jest.fn(),
}));

const { GuardrailEngine } = require('../../src/engine/guardrails');

// One guardrail spec, driven per-test.
let SPECS = [];
jest.spyOn(GuardrailEngine.prototype, 'enabledSpecs').mockImplementation(async () => SPECS);

const jobs = require('../../src/engine/jobs');

function blockRule(trigger, action = 'block', type = 'contains') {
  return {
    name: 'test-rule', description: '', enabled: true,
    scope: ['output'], channels: ['chat'], action,
    rules: [{ type, values: [trigger], case_sensitive: false }], tests: [],
  };
}

function sink() {
  const chunks = [];
  let resets = 0;
  const ctl = new AbortController();
  return {
    chunks,
    get resets() { return resets; },
    signal: ctl.signal,
    abort: () => ctl.abort(),
    onChunk: (t) => chunks.push(t),
    onReset: () => { resets += 1; },
    text: () => chunks.join(''),
  };
}

beforeEach(() => {
  created.messages = [];
  created.reviews = [];
  script.deltas = [];
  script.aborted = false;
  SPECS = [];
});

describe('assistantChatTurn — streaming, clean output', () => {
  it('releases screened text and returns the same result the buffered path would', async () => {
    script.deltas = ['Here is ', 'an answer. ', 'And a second one. '];
    const s = sink();
    const result = await jobs.assistantChatTurn('asst-1', 'hi', null, null, null, s);

    expect(result.status).toBe('sent');
    expect(result.reply).toBe('Here is an answer. And a second one.');
    // everything streamed concatenates to the reply (modulo the trailing space
    // the reply is trimmed of) — no dupes, no gaps, no unscreened extras
    expect(s.text().trim()).toBe(result.reply);
    expect(s.resets).toBe(0);
  });

  it('persists the assistant message exactly once, as on the buffered path', async () => {
    script.deltas = ['Fine. '];
    await jobs.assistantChatTurn('asst-1', 'hi', null, null, null, sink());
    const assistant = created.messages.filter((m) => m.role === 'assistant');
    expect(assistant).toHaveLength(1);
    expect(assistant[0].status).toBe('sent');
  });
});

describe('assistantChatTurn — streaming, halting verdicts', () => {
  it('streams nothing and substitutes the canned reply when output is blocked', async () => {
    SPECS = [blockRule('forbidden')];
    script.deltas = ['This is forbidden content. ', 'more. '];
    const s = sink();
    const result = await jobs.assistantChatTurn('asst-1', 'hi', null, null, null, s);

    expect(s.text()).toBe('');
    expect(result.status).toBe('blocked_output');
    expect(result.reply).toMatch(/can't help with that request/);
    expect(result.reply).not.toContain('forbidden content');
  });

  it('aborts the generation as soon as the guard halts', async () => {
    SPECS = [blockRule('stopnow')];
    script.deltas = ['lead in. ', 'stopnow here. ', 'never generated. '];
    await jobs.assistantChatTurn('asst-1', 'hi', null, null, null, sink());
    expect(script.aborted).toBe(true);
  });

  it('retracts an already-released prefix when the verdict lands', async () => {
    SPECS = [blockRule('poison')];
    script.deltas = ['Innocent opening. ', 'then poison. '];
    const s = sink();
    const result = await jobs.assistantChatTurn('asst-1', 'hi', null, null, null, s);

    // the safe prefix legitimately went out...
    expect(s.text()).toBe('Innocent opening. ');
    // ...and the client is told to drop it, because the final reply replaced it
    expect(s.resets).toBe(1);
    expect(result.status).toBe('blocked_output');
  });

  it('files a Review and holds the reply on an escalate verdict, as buffered does', async () => {
    SPECS = [blockRule('escalate-me', 'escalate')];
    script.deltas = ['please escalate-me now. '];
    const s = sink();
    const result = await jobs.assistantChatTurn('asst-1', 'hi', null, null, null, s);

    expect(result.status).toBe('escalated_output');
    expect(result.reply).toMatch(/human agent is reviewing/);
    expect(created.reviews).toHaveLength(1);
    expect(s.text()).toBe('');
  });

  it('keeps streaming through a warn verdict', async () => {
    SPECS = [blockRule('meh', 'warn')];
    script.deltas = ['meh, still fine. '];
    const s = sink();
    const result = await jobs.assistantChatTurn('asst-1', 'hi', null, null, null, s);
    expect(result.status).toBe('sent');
    expect(s.text().trim()).toBe('meh, still fine.');
  });
});

describe('assistantChatTurn — streaming vs buffered parity', () => {
  it('produces an identical result object either way for the same generation', async () => {
    script.deltas = ['Same answer either way. '];
    const streamed = await jobs.assistantChatTurn('asst-1', 'hi', null, null, null, sink());
    const buffered = await jobs.assistantChatTurn('asst-1', 'hi', null, null, null, null);
    expect(streamed.reply).toBe(buffered.reply);
    expect(streamed.status).toBe(buffered.status);
    expect(Object.keys(streamed).sort()).toEqual(Object.keys(buffered).sort());
  });

  it('does not run llm_judge rules mid-stream', async () => {
    // An llm_judge rule would issue a model call per released chunk. It must be
    // filtered out of the mid-stream screen and only run on the final text.
    const judged = {
      name: 'judged', description: '', enabled: true,
      scope: ['output'], channels: ['chat'], action: 'block',
      rules: [{ type: 'llm_judge', prompt: 'is it bad?', fail_marker: 'FAIL' }], tests: [],
    };
    SPECS = [judged];
    const judgeSpy = jest.spyOn(GuardrailEngine.prototype, 'ruleFires');
    script.deltas = ['One. ', 'Two. ', 'Three. '];
    await jobs.assistantChatTurn('asst-1', 'hi', null, null, null, sink());

    const midStreamJudgeCalls = judgeSpy.mock.calls.filter(([rule]) => rule.type === 'llm_judge');
    // the final output screen may run it once; the three released chunks must not
    expect(midStreamJudgeCalls.length).toBeLessThanOrEqual(1);
    judgeSpy.mockRestore();
  });
});
