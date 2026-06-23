/**
 * ═══════════════════════════════════════════════════════════
 * ExternalLabeler model (table: external_labelers)
 *
 * One row per labeler we subscribe to: the subscribeLabels endpoint, the issuer
 * DID, and our consume cursor (their last seq we stored) so we resume after a
 * restart.
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ExternalLabeler = sequelize.define(
    'ExternalLabeler',
    {
      // The wss subscribeLabels URL (our subscription key).
      endpoint: { type: DataTypes.STRING(512), primaryKey: true },
      did: { type: DataTypes.STRING(256), allowNull: true },
      cursor: { type: DataTypes.BIGINT, allowNull: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      lastError: { type: DataTypes.TEXT, allowNull: true, field: 'last_error' },
      lastConnectedAt: { type: DataTypes.DATE, allowNull: true, field: 'last_connected_at' },
      // Live health (written by the worker's consumer + reconcile loop).
      // 'idle' | 'connecting' | 'connected' | 'disconnected'
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'idle' },
      // Last time a label frame was received (staleness/lag proxy).
      lastEventAt: { type: DataTypes.DATE, allowNull: true, field: 'last_event_at' },
      // (Re)connection attempts since the consumer started.
      connectAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'connect_attempts' },
      // Touched every reconcile while a consumer is live — lets the UI detect a
      // dead/absent worker (stale heartbeat) vs. a genuinely connected labeler.
      heartbeatAt: { type: DataTypes.DATE, allowNull: true, field: 'heartbeat_at' },
    },
    {
      tableName: 'external_labelers',
      timestamps: true,
      underscored: true,
    }
  );

  return ExternalLabeler;
};
