/**
 * ═══════════════════════════════════════════════════════════════════════
 * PostModeration Model  (FEAT-009 / ADR 0004 §3.1)
 *
 * Per-post text-moderation state, in a SIDE TABLE (`timeline.post_moderation`)
 * rather than as new columns on the hot `posts` table — the same reasoning as
 * FEAT-031's `file_moderation` (services/filevault/src/models/FileModeration.js):
 *
 *   1. The repo's sync-based `db:migrate` CREATES new tables but does NOT ALTER
 *      existing ones (memory: db-migrate-cannot-add-columns / BUG-011). Adding
 *      columns to `posts` would leave every timeline query 500ing until a
 *      hand-run migration catches the schema up. A brand-new side table syncs
 *      cleanly with zero ALTER risk.
 *   2. It keeps moderation churn (status flips, verdict JSON) off the row every
 *      feed/serve query reads.
 *
 * One row per post (1:1, `post_id` UNIQUE + NOT NULL, FK CASCADE).
 *
 * Visibility posture is DELIBERATELY DIFFERENT from images (ADR 0004 §5b): text
 * is FAIL-OPEN — a post is servable the instant it is created and a later
 * `rejected` verdict RETRACTS it (visibility→private + socket retraction). The
 * read-gate only holds `pending` text when MODERATION_HOLD_TEXT_PENDING is on
 * (default off). Images stay fail-closed in their own FEAT-031 lane.
 *
 * NO post content is stored here — only `content_hash` (sha256 hex, the
 * compare-and-set token that defeats the edit-mid-flight TOCTOU, BUG-022) and
 * the verdict scores.
 *
 * Timeline models are camelCase (no global `underscored`), so every snake_case
 * column carries an explicit `field:` map (risk_score, content_hash,
 * moderation_item_id, last_error). Timestamps stay camelCase (createdAt/
 * updatedAt) to match the rest of the schema — the reconcile sweep's partial
 * index is on "updatedAt".
 * ═══════════════════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const PostModeration = sequelize.define('PostModeration', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    postId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'post_id',
      references: { model: 'posts', key: 'id' },
      comment: 'The post this moderation record belongs to (1:1)'
    },
    status: {
      // pending  — awaiting the worker's verdict. Text is servable while pending
      //            unless MODERATION_HOLD_TEXT_PENDING is on (fail-OPEN, §5b).
      // approved — verdict clean (servable).
      // rejected — verdict flagged / hard-remove action → RETRACTED
      //            (visibility→private + socket retraction).
      // failed   — moderation could not complete after retries, or a
      //            deterministic non-retryable error (invalid content_type).
      //            Terminal; surfaces in the DLQ. Servable (text fail-open).
      // skipped  — moderation NOT APPLICABLE: the feature is off, or the worker
      //            had no AI provider configured. Servable.
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'failed', 'skipped'),
      allowNull: false,
      defaultValue: 'pending'
    },
    reason: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'Why the current status was set (feature_disabled, clean, flagged, no_ai_provider, invalid_content_type, error)'
    },
    action: {
      type: DataTypes.STRING(32),
      allowNull: true,
      comment: 'Moderator action verdict mirrored for local enforcement (reject/remove/hide/flag/approve)'
    },
    riskScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'risk_score'
    },
    verdict: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'moderateContent scores/riskLevel/requiresReview (NO raw content)'
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
      comment: 'sha256 hex of the judged content; the compare-and-set token (BUG-022)'
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
    tableName: 'post_moderation',
    timestamps: true,
    indexes: [
      // 1:1 with posts.
      { unique: true, fields: ['post_id'], name: 'post_moderation_post_id_uk' },
      // Reconcile sweep (§4.2 step 6) scans ONLY rows stuck at pending, oldest
      // first — a PARTIAL index keeps it tiny (it excludes every terminal row).
      {
        name: 'post_moderation_pending_updated_at',
        fields: ['updatedAt'],
        where: { status: 'pending' }
      }
    ]
  });

  PostModeration.associate = function (models) {
    // A moderation row is strictly DEPENDENT on its post (1:1, post_id NOT NULL).
    // onDelete CASCADE — not Sequelize's hasOne default of SET NULL (the
    // FEAT-031 FK trap, filevault migration 20260710000001) — so a post delete
    // takes its moderation row with it and post_id can stay NOT NULL. The
    // fix-post-moderation-fk-cascade migration enforces this at the DB level
    // because sync emits SET NULL regardless of what associate() declares.
    PostModeration.belongsTo(models.Post, {
      foreignKey: 'post_id', as: 'post', onDelete: 'CASCADE', onUpdate: 'CASCADE'
    });
    models.Post.hasOne(PostModeration, {
      foreignKey: 'post_id', as: 'moderation', onDelete: 'CASCADE', onUpdate: 'CASCADE'
    });
  };

  return PostModeration;
};
