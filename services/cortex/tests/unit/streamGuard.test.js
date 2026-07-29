'use strict';

/**
 * FEAT-090 — screened-prefix streaming guard.
 *
 * These are the tests that hold the safety property: text may leave the process
 * ONLY after the guardrail engine has passed over everything accumulated up to
 * that point. The standalone Exprsn-Cortex reference streams raw and moderates
 * afterwards; the whole point of this file is that we do not.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const { createStreamGuard, lastBoundaryEnd, MAX_HOLD_CHARS } = require('../../src/engine/streamGuard');

/** Guardrail stub: fires `action` when `trigger` appears anywhere in the text. */
function evaluator({ trigger = null, action = 'block' } = {}) {
  const calls = [];
  const fn = async (text, scope, channel) => {
    calls.push({ text, scope, channel });
    if (trigger && text.includes(trigger)) {
      return { action, hits: [{ guardrail: 'test-rule', action }] };
    }
    return { action: 'pass', hits: [] };
  };
  fn.calls = calls;
  return fn;
}

async function pushAll(guard, deltas) {
  const out = [];
  for (const d of deltas) {
    const r = await guard.push(d);
    if (r.text) out.push(r.text);
  }
  return out;
}

describe('lastBoundaryEnd', () => {
  it('finds the last sentence end', () => {
    expect(lastBoundaryEnd('One. Two. Thr', 0)).toBe(10);
  });

  it('treats a newline as a boundary', () => {
    expect(lastBoundaryEnd('a line\nmore', 0)).toBe(7);
  });

  it('does not split a decimal or an abbreviation mid-number', () => {
    // "3.14" has no whitespace after the dot, so it is not a boundary.
    expect(lastBoundaryEnd('pi is 3.14', 0)).toBe(-1);
  });

  it('returns -1 while a short tail holds no boundary', () => {
    expect(lastBoundaryEnd('no boundary yet', 0)).toBe(-1);
  });

  it('releases a boundary-less run once it exceeds the hold ceiling', () => {
    const long = 'x'.repeat(MAX_HOLD_CHARS + 5);
    expect(lastBoundaryEnd(long, 0)).toBe(long.length);
  });
});

describe('createStreamGuard — release discipline', () => {
  it('holds text until a boundary, then releases the screened prefix', async () => {
    const evaluate = evaluator();
    const guard = createStreamGuard(evaluate, 'chat');

    expect((await guard.push('Hello ')).text).toBe('');
    expect((await guard.push('there')).text).toBe('');
    const released = (await guard.push('. Next')).text;
    expect(released).toBe('Hello there. ');
    expect(guard.released()).toBe('Hello there. ');
  });

  it('releases the remainder on finish()', async () => {
    const guard = createStreamGuard(evaluator(), 'chat');
    await guard.push('One. ');
    const tail = await guard.finish();
    expect(tail.text).toBe('');

    const g2 = createStreamGuard(evaluator(), 'chat');
    await g2.push('One. Two without end');
    expect((await g2.finish()).text).toBe('Two without end');
  });

  it('never releases the same text twice across many pushes', async () => {
    const guard = createStreamGuard(evaluator(), 'chat');
    const chunks = await pushAll(guard, ['A one. ', 'B two. ', 'C three. ', 'tail']);
    chunks.push((await guard.finish()).text);
    expect(chunks.join('')).toBe('A one. B two. C three. tail');
  });

  it('screens the WHOLE accumulated buffer, not just the new slice', async () => {
    // A rule that only matches across a chunk seam must still fire — screening
    // slices independently would let it through in halves.
    const evaluate = evaluator({ trigger: 'for bidden' });
    const guard = createStreamGuard(evaluate, 'chat');
    await guard.push('this is for ');
    const r = await guard.push('bidden. ');
    expect(r.halted).toBe(true);
    expect(r.text).toBe('');
    // and every evaluation saw the full prefix, not a fragment
    expect(evaluate.calls.every((c) => guard.buffered().startsWith(c.text))).toBe(true);
  });

  it('passes scope "output" and the caller channel to the engine', async () => {
    const evaluate = evaluator();
    const guard = createStreamGuard(evaluate, 'chat');
    await guard.push('Screen me. ');
    expect(evaluate.calls[0].scope).toBe('output');
    expect(evaluate.calls[0].channel).toBe('chat');
  });
});

describe('createStreamGuard — halting verdicts', () => {
  it('halts and releases nothing on a block verdict', async () => {
    const guard = createStreamGuard(evaluator({ trigger: 'badword' }), 'chat');
    const r = await guard.push('here is badword. ');
    expect(r.halted).toBe(true);
    expect(r.text).toBe('');
    expect(guard.halted).toBe(true);
    expect(guard.haltVerdict.action).toBe('block');
    expect(guard.released()).toBe('');
  });

  it('halts on an escalate verdict too — a held reply must not go out either', async () => {
    const guard = createStreamGuard(evaluator({ trigger: 'review-me', action: 'escalate' }), 'chat');
    const r = await guard.push('please review-me now. ');
    expect(r.halted).toBe(true);
    expect(guard.haltVerdict.action).toBe('escalate');
  });

  it('keeps streaming through a warn verdict', async () => {
    const guard = createStreamGuard(evaluator({ trigger: 'meh', action: 'warn' }), 'chat');
    const r = await guard.push('meh but fine. ');
    expect(r.halted).toBe(false);
    expect(r.text).toBe('meh but fine. ');
  });

  it('releases nothing after a halt, even on further pushes and finish()', async () => {
    const guard = createStreamGuard(evaluator({ trigger: 'stop' }), 'chat');
    await guard.push('please stop. ');
    expect((await guard.push('more text. ')).text).toBe('');
    expect((await guard.finish()).text).toBe('');
    expect(guard.released()).toBe('');
  });

  it('retains the full buffered draft after a halt so the caller can re-verdict it', async () => {
    // jobs.js feeds guard.buffered() back through the normal output-guardrail
    // path so the persisted status/Review match the non-streaming outcome.
    const guard = createStreamGuard(evaluator({ trigger: 'nope' }), 'chat');
    await guard.push('leading text nope trailing. ');
    expect(guard.buffered()).toBe('leading text nope trailing. ');
  });

  it('does not release a prefix that was already safe when a later chunk trips the rule', async () => {
    // The dangerous ordering: an earlier boundary passed, so a prefix was
    // legitimately released; the halt must stop everything AFTER that point.
    const guard = createStreamGuard(evaluator({ trigger: 'poison' }), 'chat');
    const first = await guard.push('Safe opening. ');
    expect(first.text).toBe('Safe opening. ');
    const second = await guard.push('now poison. ');
    expect(second.text).toBe('');
    expect(guard.released()).toBe('Safe opening. ');
  });
});

describe('createStreamGuard — boundary-less output', () => {
  it('still screens before releasing an over-long boundary-less run', async () => {
    const evaluate = evaluator();
    const guard = createStreamGuard(evaluate, 'chat', 20);
    const r = await guard.push('x'.repeat(25));
    expect(r.text).toHaveLength(25);
    expect(evaluate.calls).toHaveLength(1); // screened, not bypassed
  });

  it('blocks an over-long boundary-less run that trips a rule', async () => {
    const guard = createStreamGuard(evaluator({ trigger: 'zzz' }), 'chat', 20);
    const r = await guard.push('aaaaaaaaaaaaaaaaaaaaazzz');
    expect(r.halted).toBe(true);
    expect(r.text).toBe('');
  });
});
