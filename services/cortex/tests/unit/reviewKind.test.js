'use strict';

/**
 * FEAT-081 escalate regression guard.
 *
 * QA caught that `runAgentChain`'s escalate path wrote
 * `Review.create({ kind: 'agent_step' })` while the model's ENUM only carried
 * four values, so every escalate threw `invalid input value for enum` — turning
 * "hold this for human review" into "fail the run". No review row was written.
 *
 * The existing suites were STRUCTURALLY blind to it: `chain.test.js` injects
 * `onEscalate` as a stub, and `agentChainRun.test.js` mocks `../../src/models`,
 * so neither ever met the real column definition. Adding one more mocked test
 * would have been blind in the same way.
 *
 * So this checks the invariant directly and without a DB: every `kind` literal
 * the source writes must be declared in the model's ENUM. It fails on a new
 * `Review.create({ kind: … })` whose value nobody added to the model — which is
 * exactly the mistake that shipped.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../src');

/** Every `kind: '…'` literal passed to a Review.create call under src/. */
function reviewKindLiteralsInSource() {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const text = fs.readFileSync(p, 'utf8');
      // Review.create({ ... kind: 'x' ... }) — tolerant of line breaks between.
      const re = /Review\.create\(\{[\s\S]{0,400}?kind:\s*'([^']+)'/g;
      let m = re.exec(text);
      while (m) { found.add(m[1]); m = re.exec(text); }
    }
  };
  walk(SRC);
  return found;
}

describe('Review.kind — every value the code writes is declared on the model', () => {
  const { Review } = require('../../src/models');
  const declared = new Set(Review.rawAttributes.kind.values);

  it('declares agent_step (FEAT-081 escalate path)', () => {
    expect(declared.has('agent_step')).toBe(true);
  });

  it('keeps the four pre-existing kinds', () => {
    for (const k of ['assistant_reply', 'cs_chat_input', 'cs_chat_reply', 'cs_email']) {
      expect(declared.has(k)).toBe(true);
    }
  });

  it('finds the source literals at all (guards the scan itself)', () => {
    // If the regex silently stops matching, the assertion below becomes
    // vacuously true — so prove the scan still sees the known call sites.
    const used = reviewKindLiteralsInSource();
    expect(used.size).toBeGreaterThanOrEqual(4);
    expect(used.has('assistant_reply')).toBe(true);
  });

  it('every kind written anywhere in src/ is a declared enum value', () => {
    const used = reviewKindLiteralsInSource();
    const undeclared = [...used].filter((k) => !declared.has(k));
    expect(undeclared).toEqual([]);
  });
});
