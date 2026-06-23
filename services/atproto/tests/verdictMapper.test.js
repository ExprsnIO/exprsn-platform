const { mapVerdict } = require('../src/labeler/verdictMapper');

describe('verdictMapper.mapVerdict', () => {
  test('clean content yields no labels', () => {
    const { vals } = mapVerdict({
      action: 'auto_approve',
      scores: { toxicity: 5, nsfw: 2, spam: 1, violence: 0, hateSpeech: 0 },
    });
    expect(vals).toEqual([]);
  });

  test('high category scores produce category labels (nested scores shape)', () => {
    const { vals } = mapVerdict({
      action: 'flag',
      scores: { toxicity: 80, nsfw: 90, spam: 10, violence: 0, hateSpeech: 75 },
    });
    expect(vals).toEqual(expect.arrayContaining(['toxic', 'nsfw', 'hate', '!warn']));
    expect(vals).not.toContain('spam');
  });

  test('reject/remove/hide actions map to !hide (flat scores shape)', () => {
    expect(mapVerdict({ action: 'reject', toxicityScore: 0 }).vals).toContain('!hide');
    expect(mapVerdict({ action: 'remove' }).vals).toContain('!hide');
    expect(mapVerdict({ action: 'hide' }).vals).toContain('!hide');
  });

  test('thresholds are configurable', () => {
    const c = { action: 'approve', spamScore: 50 };
    expect(mapVerdict(c).vals).not.toContain('spam');
    expect(mapVerdict(c, { thresholds: { spam: 40 } }).vals).toContain('spam');
  });

  test('deduplicates label values', () => {
    const { vals } = mapVerdict({ action: 'flag', scores: { toxicity: 99 } });
    expect(new Set(vals).size).toBe(vals.length);
  });
});
