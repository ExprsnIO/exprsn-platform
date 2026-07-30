'use strict';

/**
 * FEAT-090 — `lib/llama.js` chatCompleteStream: SSE frame parsing, tool-call
 * assembly, cancellation, and the semaphore contract.
 *
 * The frame-reassembly cases matter because the router does NOT guarantee one
 * SSE frame per network chunk: a frame can be split anywhere, including mid-JSON
 * and mid-`data:` prefix.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const { chatCompleteStream } = require('../../src/lib/llama');

/** Build a fetch Response whose body yields `chunks` (strings) as Uint8Arrays. */
function streamResponse(chunks, { ok = true, status = 200 } = {}) {
  const enc = new TextEncoder();
  return {
    ok,
    status,
    text: async () => chunks.join(''),
    body: (async function* gen() {
      for (const c of chunks) yield enc.encode(c);
    }()),
  };
}

function frame(delta, finishReason = null) {
  return `data: ${JSON.stringify({
    choices: [{ delta, ...(finishReason ? { finish_reason: finishReason } : {}) }],
  })}\n\n`;
}

let originalFetch;
beforeEach(() => { originalFetch = global.fetch; });
afterEach(() => { global.fetch = originalFetch; });

describe('chatCompleteStream — frame parsing', () => {
  it('concatenates content deltas and reports them through onDelta in order', async () => {
    global.fetch = jest.fn(async () => streamResponse([
      frame({ content: 'Hello' }),
      frame({ content: ' world' }),
      frame({}, 'stop'),
      'data: [DONE]\n\n',
    ]));
    const seen = [];
    const r = await chatCompleteStream('m', [], {}, { onDelta: (d) => d.content && seen.push(d.content) });
    expect(r.text).toBe('Hello world');
    expect(r.finishReason).toBe('stop');
    expect(seen).toEqual(['Hello', ' world']);
  });

  it('reassembles a frame split across network chunks', async () => {
    const whole = frame({ content: 'split-safe' });
    const cut = Math.floor(whole.length / 2);
    global.fetch = jest.fn(async () => streamResponse([
      whole.slice(0, cut), whole.slice(cut), 'data: [DONE]\n\n',
    ]));
    const r = await chatCompleteStream('m', [], {}, {});
    expect(r.text).toBe('split-safe');
  });

  it('handles several frames arriving in one chunk', async () => {
    global.fetch = jest.fn(async () => streamResponse([
      frame({ content: 'a' }) + frame({ content: 'b' }) + frame({ content: 'c' }),
    ]));
    const r = await chatCompleteStream('m', [], {}, {});
    expect(r.text).toBe('abc');
  });

  it('ignores keep-alive comments and unparseable frames without failing', async () => {
    global.fetch = jest.fn(async () => streamResponse([
      ': ping\n\n',
      'data: not-json\n\n',
      frame({ content: 'ok' }),
    ]));
    const r = await chatCompleteStream('m', [], {}, {});
    expect(r.text).toBe('ok');
  });

  it('sends stream:true in the request body', async () => {
    global.fetch = jest.fn(async () => streamResponse([frame({ content: 'x' })]));
    await chatCompleteStream('my-model', [{ role: 'user', content: 'hi' }], { temperature: 0.1 }, {});
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
    expect(body.model).toBe('my-model');
    expect(body.temperature).toBe(0.1);
  });
});

describe('chatCompleteStream — tool calls', () => {
  it('assembles tool-call name and arguments across deltas, by index', async () => {
    global.fetch = jest.fn(async () => streamResponse([
      frame({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'read_', arguments: '{"pa' } }] }),
      frame({ tool_calls: [{ index: 0, function: { name: 'file', arguments: 'th":"a.txt"}' } }] }),
    ]));
    const r = await chatCompleteStream('m', [], { tools: [] }, {});
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0].id).toBe('c1');
    expect(r.toolCalls[0].function.name).toBe('read_file');
    expect(JSON.parse(r.toolCalls[0].function.arguments)).toEqual({ path: 'a.txt' });
  });

  it('flags tool-call deltas through onDelta so callers can suppress emission', async () => {
    global.fetch = jest.fn(async () => streamResponse([
      frame({ tool_calls: [{ index: 0, function: { name: 'x', arguments: '{}' } }] }),
    ]));
    const flags = [];
    await chatCompleteStream('m', [], { tools: [] }, { onDelta: (d) => flags.push(!!d.toolCalls) });
    expect(flags).toContain(true);
  });
});

describe('chatCompleteStream — cancellation and errors', () => {
  it('throws an AbortError (not an availability error) when the signal aborts mid-stream', async () => {
    const ctl = new AbortController();
    const enc = new TextEncoder();
    // Mimic undici: once the request is aborted, iterating the body throws.
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      body: (async function* gen() {
        yield enc.encode(frame({ content: 'a' }));
        await new Promise((r) => setImmediate(r));
        if (ctl.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        yield enc.encode(frame({ content: 'b' }));
      }()),
    }));
    // Abort as soon as the first delta lands.
    await expect(chatCompleteStream('m', [], {}, {
      signal: ctl.signal,
      onDelta: () => ctl.abort(),
    })).rejects.toMatchObject({ name: 'AbortError', code: 'LLM_CANCELLED' });
  });

  it('does not start a generation when the signal is already aborted', async () => {
    const ctl = new AbortController();
    ctl.abort();
    global.fetch = jest.fn(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); });
    await expect(chatCompleteStream('m', [], {}, { signal: ctl.signal }))
      .rejects.toMatchObject({ code: 'LLM_CANCELLED' });
  });

  it('surfaces a non-OK router response without echoing the request body', async () => {
    global.fetch = jest.fn(async () => streamResponse(['upstream boom'], { ok: false, status: 502 }));
    await expect(chatCompleteStream('m', [{ role: 'user', content: 'SECRET-PROMPT' }], {}, {}))
      .rejects.toThrow(/chat-stream\(m\) -> 502/);
    const err = await chatCompleteStream('m', [{ role: 'user', content: 'SECRET-PROMPT' }], {}, {})
      .catch((e) => e);
    expect(err.message).not.toContain('SECRET-PROMPT');
  });

  it('releases the concurrency slot after a failure so later calls still run', async () => {
    global.fetch = jest.fn(async () => streamResponse(['nope'], { ok: false, status: 500 }));
    await expect(chatCompleteStream('m', [], {}, {})).rejects.toThrow();
    global.fetch = jest.fn(async () => streamResponse([frame({ content: 'recovered' })]));
    const r = await chatCompleteStream('m', [], {}, {});
    expect(r.text).toBe('recovered');
  });
});
