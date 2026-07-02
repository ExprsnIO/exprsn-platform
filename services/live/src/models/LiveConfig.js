/**
 * LiveConfig — persisted admin configuration for the Live module.
 * One row per section (limits, provider, recording, roompolicy, moderation);
 * `data` holds that section's key→value settings. Replaces the previous
 * in-memory-only config so admin edits survive restarts.
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class LiveConfig extends Model {}

LiveConfig.init(
  {
    section: {
      type: DataTypes.STRING(64),
      primaryKey: true
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  },
  {
    sequelize,
    modelName: 'LiveConfig',
    tableName: 'live_config',
    timestamps: true,
    underscored: true
  }
);

module.exports = LiveConfig;
