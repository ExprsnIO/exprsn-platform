/**
 * ═══════════════════════════════════════════════════════════════════════
 * FileModeration Model  (FEAT-031)
 *
 * Per-file image-moderation state, kept in a SIDE TABLE rather than as new
 * columns on the hot `files` table. Two reasons:
 *   1. The DBA flagged the ALTER-on-existing-table trap — this repo's
 *      sync-based `db:migrate` CREATES new tables but does NOT ALTER existing
 *      ones (see BUG-011 / memory `db-migrate-cannot-add-columns`), so adding
 *      columns to `files` would leave every query 500ing until a hand-run
 *      migration catches the schema up. A brand-new table syncs cleanly.
 *   2. It keeps moderation churn (status flips, verdict JSON) off the row that
 *      every listing/serve query reads.
 *
 * One row per file. `status` drives visibility on every serve path
 * (fileService.isServableToOthers): `approved`/`skipped` are servable to other
 * users; `pending`/`rejected`/`failed` are held (hidden from everyone but the
 * uploader). This is the fail-closed-visibility posture Rick chose (ADR 0002
 * §6): an image is NOT shown to other users until moderation clears it.
 *
 * NO image bytes are ever stored here — only dimensions/format via `verdict`
 * (cortex strips EXIF/GPS and never returns pixels) and AI-derived text.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const FileModeration = sequelize.define('FileModeration', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    fileId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'file_id',
      references: { model: 'files', key: 'id' },
      comment: 'The file this moderation record belongs to (1:1)'
    },
    status: {
      // pending  — awaiting the worker's verdict (HIDDEN from other users)
      // approved — verdict clean (servable)
      // rejected — verdict flagged -> escalated to human review (HIDDEN)
      // failed   — moderation could not complete after retries, or a permanent
      //            UNSUPPORTED_IMAGE (HIDDEN; fail-closed)
      // skipped  — moderation NOT APPLICABLE (servable): the feature is switched
      //            off entirely, the object is not an image, or it is encrypted
      //            and cannot be read.
      //
      // The distinction that matters: "the feature is off" (skipped, servable —
      // the platform behaves exactly as it did before FEAT-031) is NOT the same
      // as "the feature is on but cortex/the router is unavailable" (pending,
      // hidden — fail-closed). Collapsing those would either hide every image on
      // a deployment that never wanted moderation, or silently serve unmoderated
      // images on one that did.
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'failed', 'skipped'),
      allowNull: false,
      defaultValue: 'pending'
    },
    reason: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'Why the current status was set (feature_disabled, not_an_image, encrypted, clean, flagged, unsupported_image, error)'
    },
    riskScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'risk_score'
    },
    verdict: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Cortex moderateImage scores/flags/explanation + imageMeta (NO pixel data)'
    },
    altText: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'alt_text'
    },
    aiTags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
      field: 'ai_tags',
      comment: 'Tags from cortex.describeImage (fail-soft; kept distinct from user File.tags)'
    },
    textInImage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'text_in_image'
    },
    moderationItemId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'moderation_item_id',
      comment: 'moderator.moderation_items.id when a verdict was persisted/escalated'
    },
    provider: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    model: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Worker attempts made (for observability / DLQ triage)'
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_error',
      comment: 'Last failure message (never contains image bytes)'
    }
  }, {
    tableName: 'file_moderation',
    indexes: [
      { unique: true, fields: ['file_id'] },
      { fields: ['status'] }
    ]
  });

  FileModeration.associate = function (models) {
    FileModeration.belongsTo(models.File, { foreignKey: 'file_id', as: 'file' });
    // The reverse side lives here too: `File` is a plain model file that knows
    // nothing about moderation, and every serve path eager-loads `moderation`.
    models.File.hasOne(FileModeration, { foreignKey: 'file_id', as: 'moderation' });
  };

  return FileModeration;
};
