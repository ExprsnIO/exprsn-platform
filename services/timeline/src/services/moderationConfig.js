/**
 * ═══════════════════════════════════════════════════════════
 * Moderation configuration service — typed, persisted (TimelineConfig)
 * settings with sane defaults. Backs the admin "Timeline Moderation"
 * config section and the post-approval pipeline.
 *
 * moderationProvider selects which moderation backend(s) screen content:
 *   exprsn   — the in-platform moderator module only
 *   external — an external service (e.g. a Bluesky/AT-proto labeler) only
 *   both     — screen through both
 *
 * approvalMechanism selects how "Require Approval for New Posts" routes
 * the approval decision:
 *   manual           — held until an admin decides (POST /api/posts/:id/approval)
 *   lowcode_workflow — fire a specific lowcode flow's webhook trigger
 *                      (approvalTarget = "<appKey>/<flowKey>", approvalSecret
 *                      = the flow's X-Hook-Token secret)
 *   lowcode_app      — emit `timeline.post.approval.requested` on the shared
 *                      plugin hook bus; event-triggered flows in the target
 *                      app (approvalTarget = appKey) pick it up
 *   webhook          — POST to approvalTarget, HMAC-signed with approvalSecret
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');

const MODERATION_PROVIDERS = ['exprsn', 'external', 'both'];
const APPROVAL_MECHANISMS = ['manual', 'lowcode_workflow', 'lowcode_app', 'webhook'];

const DEFAULTS = {
  moderation: {
    autoModeration: true,
    moderationProvider: 'exprsn',
    externalProviderUrl: '',
    contentFilters: true,
    spamDetection: true,
    flagThreshold: 3,
    enableUserReporting: true,
    requireApproval: false,
    approvalMechanism: 'manual',
    approvalTarget: '',
    approvalSecret: ''
  }
};

function defaultsFor(section) {
  return DEFAULTS[section] ? { ...DEFAULTS[section] } : {};
}

/** Merge persisted overrides over defaults for a section. */
async function getSection(section) {
  const base = defaultsFor(section);
  try {
    // Lazy require avoids a require-order cycle with models/index.js.
    const { TimelineConfig } = require('../models');
    const row = await TimelineConfig.findByPk(section);
    return row && row.data ? { ...base, ...row.data } : base;
  } catch (error) {
    logger.error('Failed to load timeline config section', { section, error: error.message });
    return base;
  }
}

/** Persist a partial patch for a section; returns the merged section. */
async function setSection(section, patch = {}) {
  const merged = { ...(await getSection(section)), ...patch };
  // Keep only known keys so junk isn't stored.
  const allowed = Object.keys(defaultsFor(section));
  const clean = {};
  for (const k of allowed) if (merged[k] !== undefined) clean[k] = merged[k];

  if (clean.moderationProvider && !MODERATION_PROVIDERS.includes(clean.moderationProvider)) {
    clean.moderationProvider = DEFAULTS.moderation.moderationProvider;
  }
  if (clean.approvalMechanism && !APPROVAL_MECHANISMS.includes(clean.approvalMechanism)) {
    clean.approvalMechanism = DEFAULTS.moderation.approvalMechanism;
  }

  const { TimelineConfig } = require('../models');
  await TimelineConfig.upsert({ section, data: clean });
  logger.info('Timeline config section saved', { section });
  return clean;
}

async function getModeration() {
  return getSection('moderation');
}

module.exports = {
  DEFAULTS,
  MODERATION_PROVIDERS,
  APPROVAL_MECHANISMS,
  defaultsFor,
  getSection,
  setSection,
  getModeration
};
