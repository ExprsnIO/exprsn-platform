const { DataTypes } = require('sequelize');

/**
 * user_relationships — the single authoritative store for user-controlled
 * block/mute edges (FEAT-011). One directed row per (actor, target, type).
 *
 * Schema is inherited from define.schema:'timeline' (models/index.js), so this
 * table is created as timeline.user_relationships and cannot leak to `public`.
 *
 * The model owns the table, the ENUM, and all three indexes (created by
 * `db:migrate` model sync). The self-block CHECK is not expressible in a
 * Sequelize define(), so it lands via a CHECK-only migration file run manually
 * (see migrations/*-add-user-relationships-self-check.js). Do NOT hand-write
 * CREATE TABLE/INDEX in that migration — sync reconciles indexes by name and
 * would create duplicates (see ADR §DDL).
 *
 * actorId/targetId are bare auth user ids (no cross-schema FK), matching the
 * Follow.followerId convention.
 */
module.exports = (sequelize) => {
  const UserRelationship = sequelize.define('UserRelationship', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4, // app-side default, matching Follow.js (no db gen_random_uuid)
      primaryKey: true
    },
    actorId: {
      type: DataTypes.UUID,
      allowNull: false // the blocking/muting user
    },
    targetId: {
      type: DataTypes.UUID,
      allowNull: false // the blocked/muted user
    },
    type: {
      type: DataTypes.ENUM('block', 'mute'),
      allowNull: false,
      defaultValue: 'block'
    },
    reason: {
      type: DataTypes.STRING(280),
      allowNull: true // actor-private; never surfaced to the target
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true // mute-only (temporary mute); NULL = permanent
    }
  }, {
    tableName: 'user_relationships',
    timestamps: true,
    indexes: [
      // one edge per (pair, type)
      { unique: true, fields: ['actorId', 'targetId', 'type'] },
      // "who I blocked/muted" — outgoing filter
      { fields: ['actorId', 'type'] },
      // "who blocked me" — REQUIRED for the bidirectional block filter. NOT
      // redundant with the unique composite above: that composite is prefixed
      // by actorId and cannot serve a targetId-leading lookup.
      { fields: ['targetId', 'type'] }
    ]
  });

  return UserRelationship;
};
