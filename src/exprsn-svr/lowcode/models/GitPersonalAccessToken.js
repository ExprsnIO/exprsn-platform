/**
 * ═══════════════════════════════════════════════════════════
 * Git Personal Access Token Model
 * Represents personal access tokens for API authentication
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitPersonalAccessToken = sequelize.define('GitPersonalAccessToken', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  tokenHash: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    field: 'token_hash'
  },
  scopes: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: ['read_repository', 'write_repository']
  },
  lastUsedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_used_at'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at'
  },
  revoked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  revokedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'revoked_at'
  }
  }, {
  tableName: 'git_personal_access_tokens',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['token_hash'], unique: true },
    { fields: ['revoked'] }
  ]
  });

  return GitPersonalAccessToken;
};
