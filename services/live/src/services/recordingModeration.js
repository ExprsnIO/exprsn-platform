'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Live recording moderation — mode, visibility gate, and enqueue (FEAT-074).
 *
 * The Live-recording analogue of filevault's imageModerationService. Governed by
 * LIVE_RECORDING_MODERATION (off | shadow | enforce), INDEPENDENT of the
 * FileVault and Cortex flags.
 *
 * Fail-CLOSED visibility: a recording is servable to non-owners only when its
 * moderation status ∈ {approved, skipped}. `pending`/`failed`/`rejected` stay
 * hidden. A recording with NO moderation row (feature off, or predating it) is
 * servable — "off" must behave exactly as the platform did before FEAT-074.
 * ═══════════════════════════════════════════════════════════
 */

const { createLogger } = require('@exprsn/shared');
const { RecordingModeration } = require('../models');
const { enqueueRecordingModeration } = require('../queues/recordingModeration');

const logger = createLogger('exprsn-live-recmod');

function moderationMode() {
  const raw = String(process.env.LIVE_RECORDING_MODERATION || '').trim().toLowerCase();
  if (raw === 'shadow') return 'shadow';
  if (raw === 'enforce' || raw === 'true') return 'enforce'; // 'true' = legacy alias
  return 'off';
}

const featureEnabled = () => moderationMode() !== 'off';

function riskThreshold() {
  const n = Number(process.env.LIVE_RECORDING_RISK_THRESHOLD);
  return Number.isFinite(n) ? n : 70;
}

// Statuses whose recording may be served to users other than the owner/host.
const SERVABLE = new Set(['approved', 'skipped']);

/** The visibility gate. No row ⇒ feature off / predates FEAT-074 ⇒ servable. */
function isServable(moderation) {
  if (!moderation) return true;
  return SERVABLE.has(moderation.status);
}

/**
 * Establish the moderation row for a freshly-finalized recording and enqueue the
 * vision pass. Called by worker:live once a recording is muxed and marked
 * `ready`. Returns the initial state (for logging).
 *   off     — no row; recording behaves as before (servable).
 *   enforce — `pending`: HIDDEN from non-owners until a verdict clears it.
 *   shadow  — `approved`/`shadow_pending`: servable immediately, still scored.
 */
async function establishAndEnqueue(recording) {
  const mode = moderationMode();
  if (mode === 'off') return { status: 'skipped', reason: 'feature_disabled' };

  const initial = mode === 'enforce'
    ? { status: 'pending', reason: null }
    : { status: 'approved', reason: 'shadow_pending' };

  // Upsert so a worker retry / re-finalize is idempotent, clearing any stale
  // verdict from a prior attempt.
  await RecordingModeration.upsert({
    recording_id: recording.id,
    ...initial,
    attempts: 0,
    risk_score: null,
    verdict: null,
    provider: null,
    backend: null,
    model: null,
    alt_text: null,
    ai_tags: [],
    text_in_image: null,
    moderation_item_id: null,
    last_error: null,
  });
  await enqueueRecordingModeration(recording.id);
  logger.info('recording moderation established', {
    recordingId: recording.id, mode, status: initial.status,
  });
  return initial;
}

module.exports = {
  moderationMode,
  featureEnabled,
  riskThreshold,
  SERVABLE,
  isServable,
  establishAndEnqueue,
};
