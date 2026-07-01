/**
 * ═══════════════════════════════════════════════════════════
 * Verdict → label mapper
 *
 * Pure translation from a moderator ModerationCase (its action/riskLevel and the
 * per-category scores) into AT-Protocol label values. No DB access, no I/O — so
 * it is trivially unit-testable. Thresholds and the action→label map are
 * configurable per category.
 *
 * System values `!hide` / `!warn` are emitted from the case ACTION; category
 * values (nsfw/spam/…/negative-sentiment) are emitted when their score crosses a
 * threshold.
 *
 * Configurability: defaults below preserve historical behavior. Operators can
 * override via the atproto config (config.labeler.verdictThresholds /
 * .actionLabels / .sentimentLabelThreshold, fed from ATPROTO_* env), and callers
 * can override per-call via opts — keeping `mapVerdict` a pure function. Order of
 * precedence (highest first): opts → config → hardcoded default.
 * ═══════════════════════════════════════════════════════════
 */

const config = require('../../config');

// Default score thresholds (0..100) above which a category label is applied.
const DEFAULT_THRESHOLDS = {
  toxic: 70, // toxicityScore
  nsfw: 60, // nsfwScore
  spam: 70, // spamScore
  violence: 70, // violenceScore
  hate: 70, // hateSpeechScore
};

// Default negative-sentiment score (0..100) at/above which 'negative-sentiment'
// is applied.
const DEFAULT_SENTIMENT_THRESHOLD = 80;

// Moderator action → system label value.
//
// The default engine (riskCalculator.determineAction) emits `reject` (risk ≥ 91)
// and `require_review` (risk 51–90); the rest (hide/remove/warn/flag/escalate)
// come from custom rules. `require_review`/`escalate` content is pending human
// review, so it gets a soft `!warn` (advise viewers) rather than `!hide` — only
// outright rejections / hides auto-suppress.
const DEFAULT_ACTION_LABEL = {
  reject: '!hide',
  remove: '!hide',
  hide: '!hide',
  warn: '!warn',
  flag: '!warn',
  require_review: '!warn',
  escalate: '!warn',
};

// Back-compat alias for the historical export name.
const ACTION_LABEL = DEFAULT_ACTION_LABEL;

/** Config-sourced overrides (safe even if the labeler config block is absent). */
function cfgLabeler() {
  return (config && config.labeler) || {};
}

/**
 * @param {Object} caseLike - a ModerationCase (or its toJSON()): { action,
 *   riskLevel, toxicityScore|scores.toxicity, nsfwScore, spamScore,
 *   violenceScore, hateSpeechScore, sentimentScore|scores.sentiment }
 * @param {Object} [opts] - per-call overrides:
 *   { thresholds, actionLabels, sentimentThreshold }
 * @returns {{ vals: string[], neg: boolean }}
 */
function mapVerdict(caseLike, opts = {}) {
  const lab = cfgLabeler();
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(lab.verdictThresholds || {}),
    ...(opts.thresholds || {}),
  };
  const actionLabels = {
    ...DEFAULT_ACTION_LABEL,
    ...(lab.actionLabels || {}),
    ...(opts.actionLabels || {}),
  };
  const sentimentThreshold = pickNum(
    opts.sentimentThreshold,
    lab.sentimentLabelThreshold,
    DEFAULT_SENTIMENT_THRESHOLD
  );

  const scores = readScores(caseLike);
  const vals = new Set();

  if (scores.toxicity >= thresholds.toxic) vals.add('toxic');
  if (scores.nsfw >= thresholds.nsfw) vals.add('nsfw');
  if (scores.spam >= thresholds.spam) vals.add('spam');
  if (scores.violence >= thresholds.violence) vals.add('violence');
  if (scores.hateSpeech >= thresholds.hate) vals.add('hate');
  if (scores.sentiment >= sentimentThreshold) vals.add('negative-sentiment');

  const action = caseLike.action && actionLabels[caseLike.action];
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
    sentiment: num(c.sentimentScore, s.sentiment),
  };
}

function num(a, b) {
  const v = a == null ? b : a;
  return typeof v === 'number' ? v : 0;
}

/** First finite number among the args (used for threshold precedence). */
function pickNum(...vals) {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return DEFAULT_SENTIMENT_THRESHOLD;
}

module.exports = {
  mapVerdict,
  DEFAULT_THRESHOLDS,
  DEFAULT_ACTION_LABEL,
  DEFAULT_SENTIMENT_THRESHOLD,
  ACTION_LABEL,
};
