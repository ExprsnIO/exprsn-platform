/**
 * Pure unit test for the verdict→label mapper.
 *
 * Standalone (no Jest, no DB, no network) — run with:
 *   node services/atproto/scripts/verdictMapper.test.js
 *
 * Verifies: action mapping, category thresholds, the NEW negative-sentiment
 * label, per-call threshold overrides, and DID-agnosticism (identical scores →
 * identical labels regardless of the subject DID method).
 */

const assert = require('assert');
const { mapVerdict } = require('../src/labeler/verdictMapper');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  // eslint-disable-next-line no-console
  console.log(`  ok  ${name}`);
}

function sorted(arr) {
  return [...arr].sort();
}

// (a) action reject → !hide, flag → !warn
check('action reject → !hide', () => {
  const { vals } = mapVerdict({ action: 'reject' });
  assert.deepStrictEqual(vals, ['!hide']);
});
check('action flag → !warn', () => {
  const { vals } = mapVerdict({ action: 'flag' });
  assert.deepStrictEqual(vals, ['!warn']);
});

// (b) toxicity >= 70 → 'toxic'
check('toxicity 70 (default threshold) → toxic', () => {
  const { vals } = mapVerdict({ scores: { toxicity: 70 } });
  assert.deepStrictEqual(vals, ['toxic']);
});
check('toxicity 69 → no toxic label', () => {
  const { vals } = mapVerdict({ scores: { toxicity: 69 } });
  assert.deepStrictEqual(vals, []);
});

// (c) NEW: sentiment >= 80 → 'negative-sentiment'
check('sentiment 80 (default threshold) → negative-sentiment', () => {
  const { vals } = mapVerdict({ scores: { sentiment: 80 } });
  assert.deepStrictEqual(vals, ['negative-sentiment']);
});
check('sentiment 79 → no negative-sentiment label', () => {
  const { vals } = mapVerdict({ scores: { sentiment: 79 } });
  assert.deepStrictEqual(vals, []);
});
check('flat sentimentScore field is read too', () => {
  const { vals } = mapVerdict({ sentimentScore: 95 });
  assert.deepStrictEqual(vals, ['negative-sentiment']);
});

// (d) custom threshold/action overrides change the output
check('opts.thresholds override lowers toxic cutoff', () => {
  const { vals } = mapVerdict(
    { scores: { toxicity: 50 } },
    { thresholds: { toxic: 40 } }
  );
  assert.deepStrictEqual(vals, ['toxic']);
});
check('opts.sentimentThreshold override raises sentiment cutoff', () => {
  const { vals } = mapVerdict(
    { scores: { sentiment: 80 } },
    { sentimentThreshold: 90 }
  );
  assert.deepStrictEqual(vals, []); // 80 < 90 → no label now
});
check('opts.actionLabels override re-maps escalate → !hide', () => {
  const { vals } = mapVerdict(
    { action: 'escalate' },
    { actionLabels: { escalate: '!hide' } }
  );
  assert.deepStrictEqual(vals, ['!hide']);
});

// (e) DID-agnostic: identical scores → identical labels regardless of subject DID.
// mapVerdict never sees a DID; it works off scores/action only. We assert that
// the same case yields the same labels for a did:web, did:plc, and did:exprsn
// subject — proving the mapper imposes no did-type restriction.
check('DID-agnostic: web/plc/exprsn subjects → identical labels', () => {
  const caseLike = {
    action: 'reject',
    scores: { toxicity: 85, sentiment: 90, hateSpeech: 75 },
  };
  const subjects = {
    web: 'at://did:web:example.com/app.bsky.feed.post/3kabc',
    plc: 'at://did:plc:abcdefghijklmnopqrstuvwx/app.bsky.feed.post/3kabc',
    exprsn: 'at://did:exprsn:z6MkExampleMultibaseKey/app.bsky.feed.post/3kabc',
  };
  const results = Object.entries(subjects).map(([, uri]) => {
    // The subject URI is incidental — mapVerdict takes only the case.
    void uri;
    return sorted(mapVerdict(caseLike).vals);
  });
  const expected = sorted(['!hide', 'toxic', 'hate', 'negative-sentiment']);
  for (const r of results) assert.deepStrictEqual(r, expected);
  // All three must be identical to each other too.
  assert.deepStrictEqual(results[0], results[1]);
  assert.deepStrictEqual(results[1], results[2]);
});

// Backward-compat: a clean case yields no labels; default behavior unchanged.
check('clean case → no labels (backward compatible)', () => {
  const { vals, neg } = mapVerdict({ scores: { toxicity: 10, sentiment: 20 } });
  assert.deepStrictEqual(vals, []);
  assert.strictEqual(neg, false);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} checks passed`);
