'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Screened-prefix streaming guard (FEAT-090).
 *
 * The problem this exists to solve: the module's contract is that assistant
 * output is screened BEFORE it goes out — `engine/jobs.js` replaces a `block`
 * verdict with BLOCKED_REPLY and an `escalate` verdict with HELD_REPLY (filing
 * a Review), and the module header states escalations "land in a human-review
 * queue instead of going out". Naive token streaming inverts that: the client
 * has rendered the whole reply before any verdict exists. (The standalone
 * Exprsn-Cortex reference does exactly this — it streams raw and emits
 * `chat:moderated` afterwards. We deliberately do not copy that.)
 *
 * So we stream SCREENED PREFIXES instead of raw tokens: accumulate deltas, and
 * whenever the buffer reaches a natural boundary, run the guardrail engine over
 * everything accumulated so far and release only the text that has passed. A
 * `block` or `escalate` verdict halts generation mid-flight and releases
 * nothing further — the caller then substitutes the canned reply exactly as the
 * non-streaming path does.
 *
 * Cost of the safety: the first visible text is a sentence rather than a single
 * token. Against a whole-answer wait on a local model that is still the
 * overwhelming share of the perceived-latency win.
 *
 * Two deliberate details:
 *   - Each screening pass evaluates the WHOLE accumulated buffer, not just the
 *     new slice. A `regex`/`contains` rule can straddle a chunk boundary, and
 *     screening slices independently would let it through in halves.
 *   - Only the cheap deterministic rule types run here. `llm_judge` rules issue
 *     a model call and the moderator screen is a 15s HTTP round-trip; running
 *     either per-chunk would cost more than the streaming saves. Both still run
 *     once over the final text in `jobs.js`, where they can still retract.
 * ═══════════════════════════════════════════════════════════
 */

// Release at sentence ends and hard line breaks. The trailing lookahead keeps
// "3.14" or "e.g. this" from being treated as a sentence end.
//
// Built fresh per scan rather than shared at module scope: a `/g` regex carries
// mutable `lastIndex`, and one shared instance across concurrent guards is a
// cross-stream data dependency waiting to bite the moment a scan stops being
// synchronous.
const BOUNDARY_SOURCE = "([.!?…][\"'’”)\\]]?(?=\\s)|\\n)";
const newBoundaryRe = () => new RegExp(BOUNDARY_SOURCE, 'g');

// If a model writes a long unbroken run (a URL, a code block, a table) with no
// boundary in sight, release anyway at this length so streaming doesn't stall
// into an effective buffer. Screening still runs first — this changes WHEN we
// screen, never WHETHER we do.
const MAX_HOLD_CHARS = 240;

// Verdict actions that must stop the stream. `block` and `escalate` both cause
// jobs.js to discard the draft and substitute a canned reply, so releasing more
// text after either one would be releasing text the user must never see.
const HALTING_ACTIONS = new Set(['block', 'escalate']);

/**
 * Index just past the last releasable boundary at or after `from`, or -1 when
 * the tail holds no boundary and is shorter than MAX_HOLD_CHARS.
 */
function lastBoundaryEnd(text, from, maxHold = MAX_HOLD_CHARS) {
  const re = newBoundaryRe();
  re.lastIndex = from;
  let end = -1;
  let m = re.exec(text);
  while (m) {
    end = m.index + m[0].length;
    m = re.exec(text);
  }
  if (end === -1) {
    return text.length - from >= maxHold ? text.length : -1;
  }
  // Carry the whitespace that follows the terminator into the same release, so
  // a chunk never arrives at the client with a stray leading space and the
  // paragraph break stays attached to the sentence that ended it.
  while (end < text.length && /\s/.test(text[end])) end += 1;
  return end;
}

/**
 * Create a guard for one generation.
 *
 * @param {(text:string, scope:string, channel:string) => Promise<{action:string,hits:object[]}>} evaluate
 *        the guardrail engine's `evaluate` (deterministic rules only — see above)
 * @param {string} channel guardrail channel ('chat')
 * @param {number} [maxHoldChars] release ceiling for boundary-less runs
 *
 * Returned guard:
 *   push(delta)  -> { text, halted, verdict }  text = newly released, screened
 *   finish()     -> { text, halted, verdict }  screens + releases the remainder
 *   buffered()   -> everything accumulated so far (released or not)
 *   released()   -> everything released so far
 */
function createStreamGuard(evaluate, channel, maxHoldChars = MAX_HOLD_CHARS) {
  let buf = '';
  let releasedTo = 0;
  let halted = false;
  let haltVerdict = null;

  async function screenAndRelease(upTo) {
    if (halted) return { text: '', halted: true, verdict: haltVerdict };
    if (upTo <= releasedTo) return { text: '', halted: false, verdict: null };
    const verdict = await evaluate(buf.slice(0, upTo), 'output', channel);
    if (verdict && HALTING_ACTIONS.has(verdict.action)) {
      halted = true;
      haltVerdict = verdict;
      return { text: '', halted: true, verdict };
    }
    const text = buf.slice(releasedTo, upTo);
    releasedTo = upTo;
    return { text, halted: false, verdict: verdict || null };
  }

  return {
    async push(delta) {
      if (halted) return { text: '', halted: true, verdict: haltVerdict };
      if (!delta) return { text: '', halted: false, verdict: null };
      buf += delta;
      const end = lastBoundaryEnd(buf, releasedTo, maxHoldChars);
      if (end === -1) return { text: '', halted: false, verdict: null };
      return screenAndRelease(end);
    },

    async finish() {
      return screenAndRelease(buf.length);
    },

    buffered() {
      return buf;
    },

    released() {
      return buf.slice(0, releasedTo);
    },

    get halted() {
      return halted;
    },

    get haltVerdict() {
      return haltVerdict;
    },
  };
}

module.exports = { createStreamGuard, lastBoundaryEnd, MAX_HOLD_CHARS, HALTING_ACTIONS };
