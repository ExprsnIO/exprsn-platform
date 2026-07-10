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

// Separate from CORTEX_ENABLED on purpose. "The feature is off" (serve images as
// the platform always did) is a different state from "the feature is on but
// cortex is unavailable" (hold images — fail closed). See FileModeration.status.
const featureEnabled = () => process.env.FILEVAULT_IMAGE_MODERATION === 'true';

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
  if (!featureEnabled()) return { status: 'skipped', reason: 'feature_disabled' };
  if (!isModeratableImage(file)) return { status: 'skipped', reason: 'not_an_image' };
  if (isEncrypted(file)) return { status: 'skipped', reason: 'encrypted' };
  return { status: 'pending', reason: null };
}

/** Should this upload be queued for a vision pass? */
function shouldQueue(file) {
  return initialState(file).status === 'pending';
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

  return {
    // Escalate-only: a flagged image is HELD for a human, never auto-deleted.
    status: flagged ? 'rejected' : 'approved',
    reason: flagged ? 'flagged' : 'clean',
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
