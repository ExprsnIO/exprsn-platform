/**
 * RecordingModeration (FEAT-074, ADR 0005)
 *
 * Per-recording moderation state — the Live-recording analogue of FileVault's
 * FileModeration. Kept as a SIDE TABLE (not columns on `recordings`) so the
 * moderation lifecycle is isolated from the recording lifecycle and a recording
 * is servable to others only once its moderation row says so.
 *
 * A new table, so `npm run db:migrate` (model sync) creates it — no manual
 * migration needed (an ALTER would; a fresh CREATE would not — STATUS #1).
 *
 * Fail-CLOSED visibility: a recording is servable to non-owners only when
 * status ∈ {approved, skipped}. `pending`/`failed`/`rejected` stay hidden.
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class RecordingModeration extends Model {}

RecordingModeration.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    recording_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      comment: 'The recording this verdict describes (one row per recording)'
    },
    status: {
      // pending  — awaiting a verdict, hidden from non-owners (enforce)
      // approved — servable (clean, or shadow-flagged-but-not-held)
      // rejected — held for a human (enforce + flagged)
      // failed   — terminal inference/decoding failure, stays hidden
      // skipped  — moderation off / not applicable, servable
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'failed', 'skipped'),
      defaultValue: 'pending',
      allowNull: false
    },
    reason: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    risk_score: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    verdict: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Aggregated per-frame scores/flags/explanation/frameScores — no pixels'
    },
    provider: {
      type: DataTypes.STRING(32),
      allowNull: true
    },
    backend: {
      type: DataTypes.STRING(32),
      allowNull: true,
      comment: 'llamacpp | ollama — which backend answered'
    },
    model: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    alt_text: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ai_tags: {
      type: DataTypes.JSONB,
      defaultValue: [],
      allowNull: false
    },
    text_in_image: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    moderation_item_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Link to the moderator ModerationItem when escalated'
    },
    attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    last_error: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'RecordingModeration',
    tableName: 'recording_moderation',
    indexes: [
      { fields: ['recording_id'], unique: true },
      { fields: ['status'] }
    ]
  }
);

module.exports = RecordingModeration;
