/**
 * ═══════════════════════════════════════════════════════════════════════
 * MessageModeration Model  (FEAT-009 / ADR 0004 §3.2)
 *
 * Per-message text-moderation state, kept in a SIDE TABLE (1:1 with
 * `spark.messages`) rather than as new columns on the hot `messages` table —
 * the same shape FEAT-031 used for images (`filevault.file_moderation`) and for
 * the same two reasons:
 *   1. This repo's sync-based `db:migrate` CREATES new tables but does NOT ALTER
 *      existing ones (memory `db-migrate-cannot-add-columns`, BUG-011). Adding
 *      columns to `messages` would 500 every read until a hand-run migration
 *      caught the schema up; a brand-new side table syncs cleanly.
 *   2. It keeps moderation churn (status flips / verdict JSON) off the row every
 *      message-list query reads.
 *
 * SPARK POLICY (Rick, ADR 0004): spark text moderation is REPORT-ONLY and
 * FAIL-OPEN. Delivery is never blocked; a message is delivered in real time and
 * only RETRACTED if an adverse verdict lands. E2EE DM text is never scored — it
 * is written `status='skipped', reason='encrypted'` (ciphertext must never reach
 * a model). Only plaintext group/channel messages are scanned.
 *
 * DBA CORRECTIONS baked in here (schema-qualified companion migration
 * 20260714000001 hardens the FK + partial index at the DB level):
 *   - single UNIQUE index on message_id (1:1)
 *   - PARTIAL index on ("updatedAt") WHERE status='pending' — the reconcile
 *     sweep's access path (find rows stranded pending past a grace window)
 *   - a (conversation_id) index
 *   - explicit `field:` maps for snake columns; camelCase timestamps
 *   - FK message_id -> messages(id) ON DELETE CASCADE ON UPDATE CASCADE
 * ═══════════════════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MessageModeration = sequelize.define('MessageModeration', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    messageId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'message_id',
      references: { model: 'messages', key: 'id' },
      comment: 'The message this moderation record belongs to (1:1)'
    },
    conversationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'conversation_id',
      comment: 'Denormalised for the retraction emit + conversation-scoped queries'
    },
    status: {
      // pending  — awaiting the worker's verdict (STILL DELIVERED — fail-open)
      // approved — verdict clean
      // rejected — verdict flagged ⇒ retract (redact content + message:redacted)
      // skipped  — not scanned: feature off, encrypted (E2EE DM), or no text
      // failed   — moderation could not complete after retries (DLQ; NOT retracted
      //            — spark is fail-OPEN, unlike filevault images which fail-closed)
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'skipped', 'failed'),
      allowNull: false,
      defaultValue: 'pending'
    },
    reason: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'feature_disabled | encrypted | no_text | clean | flagged | no_ai_provider | error | invalid_content_type'
    },
    action: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'moderator action enum, mirrored for local enforcement'
    },
    riskScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'risk_score'
    },
    verdict: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'moderateContent riskLevel/requiresReview/scores (NO raw content)'
    },
    moderationItemId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'moderation_item_id',
      comment: 'moderator.moderation_items.id when a verdict was persisted/escalated'
    },
    contentHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'content_hash',
      comment: 'sha256 hex of the judged text — the compare-and-set token (BUG-022)'
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Worker attempts made (observability / DLQ triage)'
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_error',
      comment: 'Last failure message (never contains raw content)'
    }
  }, {
    tableName: 'message_moderation',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['message_id'], name: 'message_moderation_message_id_uk' },
      { fields: ['conversation_id'], name: 'message_moderation_conversation_id_idx' },
      // Partial index: the reconcile sweep only ever scans status='pending'.
      { fields: ['updatedAt'], where: { status: 'pending' }, name: 'message_moderation_pending_updated_idx' }
    ]
  });

  return MessageModeration;
};
