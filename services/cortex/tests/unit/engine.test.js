'use strict';

// Pure unit tests for the ported engine — no DB, Redis, or LLM router needed.
// GuardrailEngine.evaluate is exercised through its explicit `specs` param
// (the same path runTests uses), so storage never comes into play.

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const agent = require('../../src/engine/agent');
const gr = require('../../src/engine/guardrails');
const tl = require('../../src/engine/tools');
const sk = require('../../src/engine/skills');
const { combinedAction } = require('../../src/engine/jobs');
const config = require('../../src/config');

// ---------------------------------------------------------------- pyDumps

describe('pyDumps (Python json.dumps parity)', () => {
  test('separators and key ordering match json.dumps', () => {
    expect(agent.pyDumps({ tool: 'write_file', args: { path: 'a.txt', n: 3 } }))
      .toBe('{"tool": "write_file", "args": {"path": "a.txt", "n": 3}}');
  });

  test('arrays, booleans, null', () => {
    expect(agent.pyDumps([1, true, null, 'x'])).toBe('[1, true, null, "x"]');
  });

  test('ensure_ascii escapes non-ASCII (BMP)', () => {
    expect(agent.pyDumps('héllo')).toBe('"h\\u00e9llo"');
  });

  test('astral chars become surrogate pairs', () => {
    expect(agent.pyDumps('🙂')).toBe('"\\ud83d\\ude42"');
  });

  test('control characters and quotes', () => {
    expect(agent.pyDumps('a"b\\c\n\t\x01')).toBe('"a\\"b\\\\c\\n\\t\\u0001"');
  });

  test('undefined object values are dropped', () => {
    expect(agent.pyDumps({ a: 1, b: undefined })).toBe('{"a": 1}');
  });
});

// ---------------------------------------------------------------- regex

describe('compilePyRegex', () => {
  test('lifts leading (?i) into a flag', () => {
    const re = gr.compilePyRegex('(?i)full refund');
    expect(re.test('FULL REFUND')).toBe(true);
    expect(re.flags).toContain('i');
  });

  test('lifts combined (?is)', () => {
    const re = gr.compilePyRegex('(?is)a.b');
    expect(re.test('A\nB')).toBe(true);
  });

  test('plain patterns pass through', () => {
    expect(gr.compilePyRegex('\\bfoo\\b').test('a foo b')).toBe(true);
  });
});

// ---------------------------------------------------------------- guardrails

describe('GuardrailEngine.evaluate', () => {
  const spec = (over = {}) => ({
    name: 'g', description: '', enabled: true, scope: ['output'],
    action: 'escalate',
    rules: [{ type: 'contains', values: ['refund'] }],
    tests: [], ...over,
  });

  test('deterministic rule fires; llm_judge is skipped when one fired', async () => {
    const judge = jest.fn().mockResolvedValue('FAIL');
    const engine = new gr.GuardrailEngine(judge);
    const s = spec({ rules: [
      { type: 'contains', values: ['refund'] },
      { type: 'llm_judge', prompt: 'p' },
    ] });
    const v = await engine.evaluate('full refund please', 'output', null, [s]);
    expect(v.action).toBe('escalate');
    expect(v.hits).toHaveLength(1);
    expect(judge).not.toHaveBeenCalled();
  });

  test('llm_judge runs only when no deterministic rule fired', async () => {
    const judge = jest.fn().mockResolvedValue('FAIL');
    const engine = new gr.GuardrailEngine(judge);
    const s = spec({ rules: [
      { type: 'contains', values: ['refund'] },
      { type: 'llm_judge', prompt: 'p' },
    ] });
    const v = await engine.evaluate('benign text', 'output', null, [s]);
    expect(judge).toHaveBeenCalledTimes(1);
    expect(v.action).toBe('escalate');
  });

  test('judge transport errors fail open (rule not fired)', async () => {
    const judge = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const engine = new gr.GuardrailEngine(judge);
    const s = spec({ rules: [{ type: 'llm_judge', prompt: 'p' }] });
    const v = await engine.evaluate('anything', 'output', null, [s]);
    expect(v.action).toBeNull();
    expect(v.hits).toHaveLength(0);
  });

  test('strongest action wins across specs', async () => {
    const engine = new gr.GuardrailEngine(null);
    const a = spec({ name: 'warned', action: 'warn' });
    const b = spec({ name: 'blocked', action: 'block' });
    const v = await engine.evaluate('refund', 'output', null, [a, b]);
    expect(v.action).toBe('block');
    expect(v.hits).toHaveLength(2);
  });

  test('channel and scope filtering', async () => {
    const engine = new gr.GuardrailEngine(null);
    const s = spec({ channels: ['cs_chat'] });
    expect((await engine.evaluate('refund', 'output', 'chat', [s])).hits).toHaveLength(0);
    expect((await engine.evaluate('refund', 'output', 'cs_chat', [s])).hits).toHaveLength(1);
    expect((await engine.evaluate('refund', 'input', 'cs_chat', [s])).hits).toHaveLength(0);
  });

  test('max_length rule', async () => {
    const engine = new gr.GuardrailEngine(null);
    const s = spec({ rules: [{ type: 'max_length', limit: 5 }] });
    expect((await engine.evaluate('123456', 'output', null, [s])).hits).toHaveLength(1);
    expect((await engine.evaluate('12345', 'output', null, [s])).hits).toHaveLength(0);
  });

  test('runTests honors trigger/pass expectations', async () => {
    const engine = new gr.GuardrailEngine(null);
    const s = spec({ tests: [
      { text: 'a refund now', expect: 'trigger' },
      { text: 'hello there', expect: 'pass' },
      { text: 'refund', expect: 'pass' }, // wrong expectation -> failed
    ] });
    const r = await engine.runTests(s);
    expect(r.passed).toBe(2);
    expect(r.failed).toBe(1);
  });
});

describe('guardrail validateSpec', () => {
  test('accepts a well-formed spec', () => {
    expect(gr.validateSpec({
      name: 'ok-name', action: 'block', scope: ['input'],
      rules: [{ type: 'regex', pattern: '(?i)x' }],
      tests: [{ text: 'x', expect: 'trigger' }],
    })).toEqual([]);
  });

  test('rejects bad name, action, scope, and empty rules', () => {
    const problems = gr.validateSpec({ name: 'bad name!', action: 'nuke', scope: [], rules: [] });
    expect(problems.length).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------- jobs

describe('combinedAction', () => {
  test('moderator verdict strengthens the guardrail action', () => {
    expect(combinedAction('warn', { effective: 'block' })).toBe('block');
    expect(combinedAction('block', { effective: 'warn' })).toBe('block');
    expect(combinedAction('escalate', null)).toBe('escalate');
    expect(combinedAction(null, { effective: 'escalate' })).toBe('escalate');
  });
});

// ---------------------------------------------------------------- agent fs

describe('safePath workspace containment', () => {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-ws-'));

  test('allows workspace-relative paths', () => {
    expect(agent.safePath(root, 'a/b.txt').startsWith(fs.realpathSync(root))).toBe(true);
  });

  test('rejects traversal and absolute escapes', () => {
    expect(() => agent.safePath(root, '../evil')).toThrow(/escapes workspace/);
    expect(() => agent.safePath(root, '/etc/passwd')).toThrow(/escapes workspace/);
  });
});

// ---------------------------------------------------------------- tools

describe('tool validateSpec / substitution', () => {
  test('http spec with matching placeholders validates', () => {
    expect(tl.validateSpec({
      name: 'w', description: 'd', kind: 'http',
      parameters: { type: 'object', required: ['q'], properties: { q: { type: 'string' } } },
      request: { method: 'GET', url: 'https://x.test/?q={q}' },
      tests: [{ args: { q: 'a' }, expect_contains: 'a' }],
    })).toEqual([]);
  });

  test('unknown placeholders are rejected', () => {
    const p = tl.validateSpec({
      name: 'w', description: 'd', kind: 'http',
      parameters: { type: 'object', properties: {} },
      request: { method: 'GET', url: 'https://x.test/{oops}' },
    });
    expect(p.join(' ')).toMatch(/placeholders with no matching parameter: oops/);
  });

  test('python spec requires def run(', () => {
    const p = tl.validateSpec({
      name: 'p', description: 'd', kind: 'python',
      parameters: { type: 'object', properties: {} }, code: 'print(1)',
    });
    expect(p.join(' ')).toMatch(/must define run\(args\)/);
  });

  test('substitute URL-encodes like urllib.parse.quote', () => {
    expect(tl.substitute('https://x/{q}', { q: "a b'c" }, true)).toBe('https://x/a%20b%27c');
    expect(tl.substitute('plain {q}', { q: 'a b' })).toBe('plain a b');
  });
});

describe('http tool SSRF guard', () => {
  test('rejects loopback targets by default', async () => {
    expect(config.cortex.toolAllowPrivateHosts).toBe(false);
    await expect(tl.assertPublicHost('http://127.0.0.1:8080/health'))
      .rejects.toThrow(/private\/loopback/);
    await expect(tl.assertPublicHost('http://localhost:9999/'))
      .rejects.toThrow(/private\/loopback/);
    await expect(tl.assertPublicHost('http://192.168.1.10/'))
      .rejects.toThrow(/private\/loopback/);
    await expect(tl.assertPublicHost('http://[::1]/'))
      .rejects.toThrow(/private\/loopback/);
  });

  test('python execution is hard-gated by CORTEX_PYTHON_TOOLS_ENABLED', async () => {
    expect(config.cortex.pythonToolsEnabled).toBe(false);
    const reg = new tl.ToolRegistry();
    await expect(reg.runPython({ code: 'def run(args):\n    return "x"', timeout: 5 }, {}))
      .rejects.toThrow(/python tools are disabled/);
  });
});

describe('http tool redirect handling', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  // Literal public IPs keep assertPublicHost on its no-DNS path (net.isIP),
  // so these tests never touch the network.
  const spec = (url = 'https://8.8.8.8/a') => ({
    name: 'r', description: 'd', kind: 'http', timeout: 5,
    parameters: { type: 'object', properties: {} },
    request: { method: 'GET', url },
  });
  const redirectRes = (location) => ({
    status: 302,
    headers: { get: (k) => (k.toLowerCase() === 'location' ? location : null) },
    body: null,
  });
  const okRes = (text) => ({
    status: 200,
    headers: { get: () => null },
    body: (async function* () { yield Buffer.from(text); })(),
  });

  test('redirect to a private address is rejected', async () => {
    global.fetch = async () => redirectRes('http://127.0.0.1:8443/internal');
    const reg = new tl.ToolRegistry();
    await expect(reg.run(spec(), {})).rejects.toThrow(/private\/loopback/);
  });

  test('redirect to a non-http scheme is rejected', async () => {
    global.fetch = async () => redirectRes('file:///etc/passwd');
    const reg = new tl.ToolRegistry();
    await expect(reg.run(spec(), {})).rejects.toThrow(/redirect left http\(s\)/);
  });

  test('redirect loops stop after the hop cap', async () => {
    global.fetch = async () => redirectRes('https://8.8.8.8/again');
    const reg = new tl.ToolRegistry();
    await expect(reg.run(spec(), {})).rejects.toThrow(/too many redirects/);
  });

  test('public-host redirects are followed and every hop is re-checked', async () => {
    const seen = [];
    global.fetch = async (url) => {
      seen.push(String(url));
      return seen.length === 1 ? redirectRes('https://8.8.4.4/b') : okRes('landed');
    };
    const reg = new tl.ToolRegistry();
    await expect(reg.run(spec(), {})).resolves.toBe('landed');
    expect(seen).toEqual(['https://8.8.8.8/a', 'https://8.8.4.4/b']);
  });
});

// ---------------------------------------------------------------- skills

describe('skill validateSpec', () => {
  test('accepts a well-formed spec', () => {
    expect(sk.validateSpec({
      name: 'clear', description: 'd', instructions: 'do things',
      recommended_tools: [],
    })).toEqual([]);
  });

  test('rejects missing instructions and bad recommended_tools', () => {
    const p = sk.validateSpec({ name: 'x', description: 'd', recommended_tools: [1] });
    expect(p.length).toBe(2);
  });
});
