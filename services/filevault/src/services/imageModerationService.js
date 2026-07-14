'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Image moderation + tagging at the FileVault upload chokepoint (FEAT-031).
 *
 * Nearly every user-uploaded image on the platform lands here — spark
 * attachments, nexus, timeline all store FileVault pointers — so one hook
 * covers them all with a single audit trail instead of five drifting copies.
 * (It is NOT universal: avatars are external URL refs and live recordings are
 * ffmpeg output on disk. See ADR 0002 §5.)
 *
 * Failure policy, split deliberately:
 *   moderateImage  → FAIL CLOSED. Any error leaves the image hidden and, if
 *                    flagged, escalates to a human. A weak model may raise for
 *                    review; it may never auto-clear and never auto-delete.
 *   describeImage  → FAIL SOFT. Tags/alt-text are a convenience; losing them
 *                    must never block a write or hide an image.
 *
 * This module is required by BOTH the gateway (to enqueue) and the worker (to
 * run). Keep it free of Bull/worker-only imports.
 * ═══════════════════════════════════════════════════════════
 */

const { createLogger } = require('@exprsn/shared');
// Cortex's public in-process façade (ADR 0001). Safe to require unconditionally:
// it pulls in only config and hard-refuses when CORTEX_ENABLED is false.
const cortex = require('../../../cortex/src/client');

const logger = createLogger('exprsn-filevault-imagemod');

// The image-moderation mode, read from FILEVAULT_IMAGE_MODERATION (TASK-026).
// This is the governing flag for the escalate-only worker path (architect's
// ruling): it is INDEPENDENT of CORTEX_MODERATION_MODE, which governs TEXT
// verdicts through moderator's provider factory. `off` on one does NOT disable
// the other. See .env.example and ARCHITECTURE.md.
//
//   off     — no image moderation. Images are `skipped`/servable exactly as the
//             platform behaved before FEAT-031. (unset / 'false' / 'off' / other)
//   enforce — score AND ACT: a flagged image is HELD (`rejected`) for human
//             review and escalated. This is the fail-closed enforcing posture.
//             Legacy value 'true' is kept as an alias for enforce (back-compat).
//   shadow  — score and RECORD the verdict (riskScore + verdict JSONB + tags) and
//             LOG it, but never HOLD: a flagged image stays `approved`/servable
//             (reason `shadow_flagged`) and is NOT escalated. This is the rung
//             TASK-023's accuracy benchmark reads to gather image shadow data.
function moderationMode() {
  const raw = String(process.env.FILEVAULT_IMAGE_MODERATION || '').trim().toLowerCase();
  if (raw === 'shadow') return 'shadow';
  if (raw === 'enforce' || raw === 'true') return 'enforce'; // 'true' = legacy back-compat
  return 'off';
}

// Separate from CORTEX_ENABLED on purpose. "The feature is off" (serve images as
// the platform always did) is a different state from "the feature is on but
// cortex is unavailable" (hold images — fail closed). See FileModeration.status.
const featureEnabled = () => moderationMode() !== 'off';

// Statuses whose objects may be served to users other than the uploader.
const SERVABLE = new Set(['approved', 'skipped']);

const IMAGE_MIME = /^image\//i;

/** Is this object something we can and should look at? */
function isModeratableImage(file) {
  return Boolean(file && typeof file.mimetype === 'string' && IMAGE_MIME.test(file.mimetype));
}

/**
 * Encrypted objects must be skipped EXPLICITLY, never "discovered" by letting
 * the decoder choke on ciphertext.
 *
 * FileVault's own `File` model has no `encrypted` column; encryption is a spark
 * concern (`Attachment.encrypted`), and an encrypted attachment's bytes reach
 * FileVault as ciphertext with an image mimetype. The uploader marks it via
 * `metadata.encrypted` (or an `application/octet-stream`-ish mimetype). Treat a
 * truthy marker as authoritative and never send those bytes to the model.
 */
function isEncrypted(file) {
  const meta = (file && file.metadata) || {};
  return Boolean(meta.encrypted || meta.e2ee || meta.encryption);
}

/**
 * The visibility gate. `requesterId` is the user asking to read the object.
 * The uploader always sees their own image; everyone else waits for a verdict.
 */
function isServableToOthers(moderation) {
  if (!moderation) return true; // no record => predates FEAT-031 / not tracked
  return SERVABLE.has(moderation.status);
}

function canServe(file, moderation, requesterId) {
  if (file && requesterId && String(file.userId) === String(requesterId)) return true;
  return isServableToOthers(moderation);
}

/**
 * Decide the initial moderation row for a freshly uploaded object. Called on the
 * upload path, so it must be synchronous and must never throw.
 */
function initialState(file) {
  const mode = moderationMode();
  if (mode === 'off') return { status: 'skipped', reason: 'feature_disabled' };
  if (!isModeratableImage(file)) return { status: 'skipped', reason: 'not_an_image' };
  if (isEncrypted(file)) return { status: 'skipped', reason: 'encrypted' };
  // enforce: HOLD until a verdict clears the image (fail-closed visibility).
  // shadow: serve IMMEDIATELY (never hold) — the verdict is recorded later but
  // never gates visibility. `shadow_pending` marks a row still awaiting its
  // shadow verdict so the worker knows to score it (it is already servable).
  if (mode === 'shadow') return { status: 'approved', reason: 'shadow_pending' };
  return { status: 'pending', reason: null };
}

/**
 * Should this upload be queued for a vision pass? True whenever moderation is on
 * (enforce OR shadow) and the object is a decodable, non-encrypted image. Note
 * this is NOT `initialState().status === 'pending'`: a shadow image is servable
 * (`approved`) from the start yet must still be scored.
 */
function shouldQueue(file) {
  if (moderationMode() === 'off') return false;
  if (!isModeratableImage(file)) return false;
  if (isEncrypted(file)) return false;
  return true;
}

/**
 * Run the vision passes for one file's bytes. Returns the patch to apply to the
 * FileModeration row. Throws ONLY on retryable moderation failures — the caller
 * (worker) decides retry vs permanent-fail from `err.code`.
 */
async function evaluate(buffer) {
  // --- verdict: fail closed. A throw here propagates to the worker.
  const verdict = await cortex.moderateImage(buffer);

  // --- tags/alt-text: fail soft. Never let this sink the verdict.
  let description = null;
  try {
    description = await cortex.describeImage(buffer);
  } catch (err) {
    logger.warn('image description unavailable (continuing without tags)', {
      code: err.code, error: err.message,
    });
  }

  const flagged = verdict.riskScore >= imageRiskThreshold();
  const enforcing = moderationMode() === 'enforce';

  // Enforce vs shadow diverge ONLY on an adverse verdict (TASK-026):
  //   enforce + flagged -> `rejected`: HELD for a human, never auto-deleted.
  //   shadow  + flagged -> `approved`/`shadow_flagged`: the verdict is recorded
  //                        (riskScore + verdict JSONB below) and logged, but the
  //                        image is NOT held and NOT escalated. This is the data
  //                        TASK-023's benchmark consumes.
  //   clean (either mode) -> `approved`/`clean`.
  let status;
  let reason;
  if (flagged) {
    status = enforcing ? 'rejected' : 'approved';
    reason = enforcing ? 'flagged' : 'shadow_flagged';
  } else {
    status = 'approved';
    reason = 'clean';
  }

  return {
    status,
    reason,
    riskScore: verdict.riskScore,
    verdict, // scores/flags/explanation/imageMeta — no pixel data
    provider: verdict.provider,
    model: verdict.model,
    altText: description ? description.altText : null,
    aiTags: description ? description.tags : [],
    textInImage: description ? description.textInImage : null,
    lastError: null,
  };
}

function imageRiskThreshold() {
  const n = Number(process.env.FILEVAULT_IMAGE_RISK_THRESHOLD);
  return Number.isFinite(n) ? n : 70;
}

/**
 * THE invariant, in one place: whenever a file's bytes are created or replaced,
 * its moderation state must be (re)established before those bytes can be served
 * to anyone else.
 *
 * This exists because the invariant was originally open-coded at the upload site
 * and then quietly violated by every *other* path that writes bytes — group
 * upload (BUG-017), new version (BUG-018), and version restore. Four call sites,
 * three bugs. Any future path that writes bytes must call this instead of
 * reinventing it.
 *
 * `mode: 'create'` for a brand-new file, `'reset'` when replacing the bytes of an
 * existing one (which clears the stale verdict — an old verdict does not
 * describe the new bytes).
 *
 * Must be called INSIDE the caller's transaction. Returns the state so the caller
 * knows whether to enqueue after commit.
 */
async function establishModerationState(FileModeration, file, { transaction, mode = 'create' }) {
  const state = initialState({ mimetype: file.mimetype, metadata: file.metadata || {} });
  if (mode === 'create') {
    await FileModeration.create({ fileId: file.id, ...state }, { transaction });
  } else {
    await FileModeration.upsert(
      {
        fileId: file.id, ...state,
        riskScore: null, verdict: null, moderationItemId: null,
        altText: null, aiTags: [], textInImage: null, lastError: null, attempts: 0,
      },
      { transaction },
    );
  }
  return state;
}

module.exports = {
  moderationMode,
  featureEnabled,
  isModeratableImage,
  isEncrypted,
  isServableToOthers,
  canServe,
  initialState,
  establishModerationState,
  shouldQueue,
  evaluate,
  imageRiskThreshold,
  SERVABLE,
};
