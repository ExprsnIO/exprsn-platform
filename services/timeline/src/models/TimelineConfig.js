/**
 * ═══════════════════════════════════════════════════════════
 * TimelineConfig Model
 * Persisted admin configuration for the Timeline module — one row per
 * section (`moderation`, …); `data` holds that section's key→value
 * settings. Replaces the in-memory-only config mutation so admin edits
 * survive restarts (same pattern as live's LiveConfig).
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TimelineConfig = sequelize.define('TimelineConfig', {
    section: {
      type: DataTypes.STRING(64),
      primaryKey: true
    },

    data: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    tableName: 'timeline_config',
    timestamps: true
  });

  return TimelineConfig;
};
