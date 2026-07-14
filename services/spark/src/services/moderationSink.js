'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Spark moderation sink  (FEAT-009 / ADR 0004 §4.2)
 *
 * The moderator worker MUST NOT write `spark.messages` / `spark.message_moderation`
 * through its own connection — that would break one-schema-per-module isolation
 * (ADR §Consequences 2). Instead spark PUBLISHES this sink; the worker resolves
 * it (`ugcSinkRegistry`) and calls `applyVerdict`, which writes ONLY spark's own
 * schema and performs spark's own enforcement.
 *
 * The SAME `applyVerdict` backs the authenticated HTTP fallback
 * `POST /spark/api/moderation/action` (routes/moderation.js) — a human's or the
 * moderator admin's decision, routed by sourceService, lands here too.
 *
 * TWO invocation environments, one behaviour:
 *   - In the WORKER process the socket server does not exist, so the
 *     `message:redacted` emit is a best-effort no-op; the DURABLE enforcement is
 *     the DB write (content redacted), which any refetch reflects.
 *   - In the GATEWAY process (the HTTP action route) `setIo` has been called from
 *     spark's `registerSockets`, so the retraction ALSO reaches connected clients
 *     in real time.
 * Either way the row write + content redaction are the source of truth.
 * ═══════════════════════════════════════════════════════════
 */

const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { SOURCE, CONTENT_TYPE } = require('./messageModeration');

// Gateway-owned Socket.IO server, injected by registerSockets(). Null in the
// worker process (no socket server there) — the retraction emit is then skipped
// and only the durable DB redaction happens.
let ioRef = null;
function setIo(io) { ioRef = io; }

// A moderator action that auto-retracts. Everything else leaves the message
// deliverable (spark is fail-OPEN; a "needs human review" verdict does NOT
// retract — a human's later decision arrives via the HTTP action route).
const REMOVE_ACTIONS = new Set(['reject', 'remove', 'hide']);

/**
 * Apply one verdict to spark's own schema with a content-hash COMPARE-AND-SET.
 * Never throws. Returns a discriminated result the worker's ladder reasons about:
 *   { applied:true, status }        — written (+ enforced if adverse)
 *   { applied:false, superseded:true } — content edited mid-flight (BUG-022): the
 *                                        hash no longer matches; wrote NOTHING
 *   { applied:false }               — no row for this content (C6): a no-op; do
 *                                        NOT resurrect it
 */
async function applyVerdict(verdict = {}) {
  const { contentId, contentHash, status } = verdict;
  if (!contentId) return { applied: false };

  // eslint-disable-next-line global-require
  const { MessageModeration, Message } = require('../models');

  // Missing row ⇒ no-op (do not resurrect — the message may have been deleted).
  const row = await MessageModeration.findOne({ where: { messageId: contentId } });
  if (!row) return { applied: false };

  // Build the patch from only the fields the worker actually sent.
  const patch = {};
  if (status !== undefined) patch.status = status;
  if (verdict.reason !== undefined) patch.reason = verdict.reason;
  if (verdict.action !== undefined) patch.action = verdict.action;
  if (verdict.riskScore !== undefined && verdict.riskScore !== null) patch.riskScore = verdict.riskScore;
  if (verdict.verdict !== undefined) patch.verdict = verdict.verdict;
  if (verdict.moderationItemId !== undefined && verdict.moderationItemId !== null) {
    patch.moderationItemId = verdict.moderationItemId;
  }
  if (verdict.lastError !== undefined) patch.lastError = verdict.lastError;
  if (verdict.bumpAttempts) {
    patch.attempts = MessageModeration.sequelize.literal('"attempts" + 1');
  }

  // Content-hash COMPARE-AND-SET (BUG-022): update ONLY where content_hash still
  // matches. A mid-flight edit already re-established the row with a new hash and
  // queued a fresh job, so this stale verdict must be discarded.
  const where = { messageId: contentId };
  if (contentHash !== undefined && contentHash !== null) where.contentHash = contentHash;

  const [count] = await MessageModeration.update(patch, { where });
  if (count === 0) return { applied: false, superseded: true };

  // Enforcement: an adverse verdict retracts the message (redact + emit).
  const rejected = status === 'rejected' || REMOVE_ACTIONS.has(verdict.action);
  if (rejected) await retractMessage(contentId, Message);

  return { applied: true, status };
}

/**
 * Retract a rejected message: redact its stored content (durable) and, when the
 * socket server is available (gateway), emit `message:redacted` on `/spark` so
 * connected clients drop it live. Never throws.
 */
async function retractMessage(messageId, Message) {
  try {
    const message = await Message.findByPk(messageId);
    if (!message || message.deleted) return;

    message.content = '[removed by moderation]';
    message.metadata = { ...(message.metadata || {}), moderationRemoved: true };
    await message.save();

    if (ioRef && typeof ioRef.of === 'function') {
      try {
        ioRef.of('/spark')
          .to(`conversation:${message.conversationId}`)
          .emit('message:redacted', {
            messageId,
            conversationId: message.conversationId,
            reason: 'moderation',
          });
      } catch (emitErr) {
        logger.debug('message:redacted emit failed (durable redaction stands)', {
          messageId, error: emitErr.message,
        });
      }
    }
  } catch (err) {
    logger.error('spark moderation retraction failed', { messageId, error: err.message });
  }
}

/**
 * Report spark's OWN rows stranded at status='pending' past a grace window, each
 * shaped as a re-submittable payload. The worker's reconcile sweep calls this so
 * it never has to read spark's tables directly — schema isolation preserved.
 * Reads only spark's schema; never throws.
 */
async function listStalePending({ graceMs, limit } = {}) {
  try {
    // eslint-disable-next-line global-require
    const { MessageModeration, Message } = require('../models');
    const cutoff = new Date(Date.now() - (graceMs || 0));
    const rows = await MessageModeration.findAll({
      where: { status: 'pending', updatedAt: { [Op.lt]: cutoff } },
      include: [{ model: Message, as: 'message', required: true }],
      order: [['updatedAt', 'ASC']],
      limit: limit || 500,
    });
    return rows
      .map((r) => ({
        sourceService: SOURCE,
        contentType: CONTENT_TYPE,
        contentId: r.messageId,
        userId: r.message.senderId,
        contentText: r.message.content,
        contentHash: r.contentHash,
        contentMetadata: { conversationId: r.conversationId },
      }))
      // Never re-submit a row whose text vanished (e.g. hard-redacted) — nothing
      // to score.
      .filter((p) => p.contentText != null);
  } catch (err) {
    logger.error('spark listStalePending failed', { error: err.message });
    return [];
  }
}

module.exports = {
  applyVerdict,
  listStalePending,
  setIo,
};
