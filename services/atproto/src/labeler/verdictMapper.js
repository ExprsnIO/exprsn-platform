/**
 * ═══════════════════════════════════════════════════════════
 * Verdict → label mapper
 *
 * Pure translation from a moderator ModerationCase (its action/riskLevel and the
 * per-category scores) into AT-Protocol label values. No DB access, no I/O — so
 * it is trivially unit-testable. Thresholds are configurable per category.
 *
 * System values `!hide` / `!warn` are emitted from the case ACTION; category
 * values (nsfw/spam/…) are emitted when their score crosses a threshold.
 * ═══════════════════════════════════════════════════════════
 */

// Default score thresholds (0..100) above which a category label is applied.
const DEFAULT_THRESHOLDS = {
  toxic: 70, // toxicityScore
  nsfw: 60, // nsfwScore
  spam: 70, // spamScore
  violence: 70, // violenceScore
  hate: 70, // hateSpeechScore
};

// Moderator action → system label value.
//
// The default engine (riskCalculator.determineAction) emits `reject` (risk ≥ 91)
// and `require_review` (risk 51–90); the rest (hide/remove/warn/flag/escalate)
// come from custom rules. `require_review`/`escalate` content is pending human
// review, so it gets a soft `!warn` (advise viewers) rather than `!hide` — only
// outright rejections / hides auto-suppress.
const ACTION_LABEL = {
  reject: '!hide',
  remove: '!hide',
  hide: '!hide',
  warn: '!warn',
  flag: '!warn',
  require_review: '!warn',
  escalate: '!warn',
};

/**
 * @param {Object} caseLike - a ModerationCase (or its toJSON()): { action,
 *   riskLevel, toxicityScore|scores.toxicity, nsfwScore, spamScore,
 *   violenceScore, hateSpeechScore }
 * @param {Object} [opts] - { thresholds }
 * @returns {{ vals: string[], neg: boolean }}
 */
function mapVerdict(caseLike, opts = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(opts.thresholds || {}) };
  const scores = readScores(caseLike);
  const vals = new Set();

  if (scores.toxicity >= thresholds.toxic) vals.add('toxic');
  if (scores.nsfw >= thresholds.nsfw) vals.add('nsfw');
  if (scores.spam >= thresholds.spam) vals.add('spam');
  if (scores.violence >= thresholds.violence) vals.add('violence');
  if (scores.hateSpeech >= thresholds.hate) vals.add('hate');

  const action = caseLike.action && ACTION_LABEL[caseLike.action];
  if (action) vals.add(action);

  return { vals: [...vals], neg: false };
}

/** Tolerate both flat (toxicityScore) and nested (scores.toxicity) shapes. */
function readScores(c) {
  const s = c.scores || {};
  return {
    toxicity: num(c.toxicityScore, s.toxicity),
    nsfw: num(c.nsfwScore, s.nsfw),
    spam: num(c.spamScore, s.spam),
    violence: num(c.violenceScore, s.violence),
    hateSpeech: num(c.hateSpeechScore, s.hateSpeech),
  };
}

function num(a, b) {
  const v = a == null ? b : a;
  return typeof v === 'number' ? v : 0;
}

module.exports = { mapVerdict, DEFAULT_THRESHOLDS };
