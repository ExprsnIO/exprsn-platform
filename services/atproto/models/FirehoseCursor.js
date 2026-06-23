/**
 * ═══════════════════════════════════════════════════════════
 * FirehoseCursor model (table: firehose_cursor)
 *
 * Persists the ingest position per transport so the consumer resumes after a
 * restart. Jetstream cursor = `time_us` (microseconds); subscribeRepos = `seq`.
 * One row per transport.
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const FirehoseCursor = sequelize.define(
    'FirehoseCursor',
    {
      // 'jetstream' | 'subscribeRepos'
      transport: { type: DataTypes.STRING(32), primaryKey: true },
      cursor: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      tableName: 'firehose_cursor',
      timestamps: true,
      underscored: true,
    }
  );

  return FirehoseCursor;
};
