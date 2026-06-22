/**
 * ═══════════════════════════════════════════════════════════
 * Session Model
 * User sessions for session management
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Session = sequelize.define('Session', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    sessionId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },

    // The CA token id (jti) minted for this session at login. This IS the bearer
    // the SPA presents, so it ties a session row to a revocable CA token. Stored
    // as STRING to match how the bearer arrives (and to avoid UUID-cast mismatch
    // on lookups). Nullable: legacy rows + the express-session cookie store have
    // none. Uniqueness is enforced logically via the recordSession upsert, not a
    // DB constraint (multiple legacy rows may carry null).
    caTokenId: {
      type: DataTypes.STRING,
      allowNull: true
    },

    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true
    },

    userAgent: {
      type: DataTypes.STRING,
      allowNull: true
    },

    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    },

    lastActivityAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },

    data: {
      type: DataTypes.JSON,
      defaultValue: {}
    },

    // Status
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'sessions',
    timestamps: true,
    indexes: [
      { fields: ['sessionId'] },
      { fields: ['userId'] },
      { fields: ['caTokenId'] },
      { fields: ['active'] },
      { fields: ['expiresAt'] }
    ]
  });

  return Session;
};
