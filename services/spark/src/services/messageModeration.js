'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Spark message text-moderation invariant  (FEAT-009 / ADR 0004 §4.1)
 *
 * THE invariant, in one place: whenever a message's text is created or edited,
 * its moderation side-table row MUST be (re)established — status='pending' for
 * scannable plaintext, status='skipped' otherwise — BEFORE the moderation job is
 * enqueued. Row existence (not the job) is the source of truth the worker's
 * reconcile sweep re-drives (ADR §4.1). This is the spark analogue of
 * FileVault's `establishModerationState` (FEAT-031), whose lesson was blunt:
 * the invariant was open-coded at one call site and then silently violated by
 * every OTHER byte-ingress path (BUG-016/017/018). Spark has FIVE real ingress
 * sites (socket send + edit, group-channel POST, forward, reply) — they ALL call
 * `moderateMessage` here instead of reinventing it.
 *
 * SPARK POLICY (Rick, ADR 0004): REPORT-ONLY + FAIL-OPEN for DM text.
 *   - E2EE DM text is NEVER scored: when the message is encrypted (content null)
 *     we write status='skipped', reason='encrypted'. Ciphertext must never reach
 *     a model. (DM *attachments* already flow to FileVault unencrypted and are
 *     moderated by FEAT-031 — that path is untouched.)
 *   - Plaintext group/channel messages ARE scanned.
 *   - Delivery is NEVER blocked: this helper never throws into the send path, and
 *     an adverse verdict RETRACTS later via the sink (redact + message:redacted).
 *
 * Gated by SPARK_TEXT_MODERATION (default OFF ⇒ everything 'skipped' and the
 * platform behaves exactly as before). "Feature off" (skipped, servable) is a
 * deliberately different state from "feature on but no scorer" (the worker's
 * terminal 'skipped'/'failed') — see the worker's ladder.
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const SOURCE = 'spark';
const CONTENT_TYPE = 'message'; // MUST be in the ModerationCase content_type enum.

// Spark is fail-OPEN: only 'rejected' withholds a message. Everything else —
// including 'failed' and 'pending' — stays deliverable (§5b). Exposed for any
// read path that wants to reason about servability; delivery itself is
// unconditional (never blocked on a verdict).
const SERVABLE = new Set(['approved', 'skipped', 'pending', 'failed']);

/** Feature switch — distinct from "a scorer is available" (worker's concern). */
function featureEnabled() {
  return process.env.SPARK_TEXT_MODERATION === 'true';
}

/**
 * Encrypted messages are skipped EXPLICITLY — never discovered by feeding
 * ciphertext to a model. A message is encrypted when the E2EE flag is set or the
 * plaintext `content` column is null (the model hook nulls it for E2EE sends).
 */
function isEncrypted(message) {
  return Boolean(message && (message.encrypted || message.content == null));
}

/** sha256 hex of the judged text — the compare-and-set token (BUG-022). */
function hashContent(text) {
  return crypto.createHash('sha256').update(String(text == null ? '' : text)).digest('hex');
}

/**
 * Decide the initial moderation row for a message. Synchronous, never throws.
 */
function initialState(message) {
  if (!featureEnabled()) return { status: 'skipped', reason: 'feature_disabled' };
  if (isEncrypted(message)) return { status: 'skipped', reason: 'encrypted' };
  if (!message.content || !String(message.content).trim()) {
    return { status: 'skipped', reason: 'no_text' };
  }
  return { status: 'pending', reason: null };
}

/** The exact producer payload for the shared UGC queue (ADR §4 shape). */
function submitPayloadFor(message, contentHash) {
  return {
    sourceService: SOURCE,
    contentType: CONTENT_TYPE,
    contentId: String(message.id),
    userId: message.senderId || null,
    contentText: message.content,
    contentHash,
    contentMetadata: { conversationId: message.conversationId },
  };
}

/**
 * (Re)establish the side-table row. `mode:'create'` for a new message,
 * `'reset'` for an EDIT (clears the stale verdict — an old verdict does not
 * describe the edited text; the stale JOB is killed separately via the queue's
 * `mode:'reset'`, BUG-016). Writes ONLY spark's own schema. Honours an optional
 * caller transaction. Returns the state + hash so the caller knows whether to
 * enqueue.
 */
async function establishMessageModerationState(MessageModeration, message, { transaction, mode = 'create' } = {}) {
  const state = initialState(message);
  const contentHash = hashContent(message.content);
  const row = {
    messageId: message.id,
    conversationId: message.conversationId,
    status: state.status,
    reason: state.reason,
    contentHash,
    // Always reset the verdict fields — on 'reset' the previous verdict is stale.
    action: null,
    riskScore: null,
    verdict: null,
    moderationItemId: null,
    lastError: null,
    attempts: 0,
  };
  if (mode === 'create') {
    await MessageModeration.create(row, { transaction });
  } else {
    await MessageModeration.upsert(row, { transaction });
  }
  return { ...state, contentHash };
}

/**
 * THE call the ingress sites use. Pre-creates the row FIRST (source of truth),
 * then fire-and-forget enqueues the scoring job — the enqueue is NEVER awaited
 * into the response (ADR §4.1). Fully self-contained and fail-OPEN: any error is
 * swallowed so message delivery is never affected (worst case: no row, and the
 * message is simply delivered unmoderated — the same as feature-off).
 *
 * @param {object} message  a persisted Message instance (has id/conversationId/
 *                           senderId/content/encrypted)
 * @param {object} [opts]   { mode: 'create' | 'reset' }
 */
async function moderateMessage(message, { mode = 'create' } = {}) {
  try {
    // eslint-disable-next-line global-require
    const { MessageModeration } = require('../models');
    const { status, contentHash } = await establishMessageModerationState(
      MessageModeration, message, { mode }
    );

    if (status === 'pending') {
      // Downward, in-process require into the moderator's shared UGC queue (the
      // atproto-bridge seam). Lazily required so 'bull' never enters spark's
      // require graph unless a message is actually queued.
      // eslint-disable-next-line global-require
      const { submitForModeration } = require('../../../moderator/src/queues/ugcModeration');
      // Fire-and-forget: submitForModeration never throws; we do NOT await it
      // into the send path.
      submitForModeration({ ...submitPayloadFor(message, contentHash), mode }).catch(() => {});
    }
    return { status };
  } catch (err) {
    logger.warn('moderateMessage failed; message delivered without a moderation row', {
      messageId: message && message.id,
      error: err.message,
    });
    return { status: 'error' };
  }
}

module.exports = {
  SOURCE,
  CONTENT_TYPE,
  SERVABLE,
  featureEnabled,
  isEncrypted,
  hashContent,
  initialState,
  submitPayloadFor,
  establishMessageModerationState,
  moderateMessage,
};
