/**
 * ═══════════════════════════════════════════════════════════
 * Git SSH Key Model
 * Represents SSH keys for Git authentication
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitSSHKey = sequelize.define('GitSSHKey', {
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
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  publicKey: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'public_key'
  },
  fingerprint: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  keyType: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'rsa',
    field: 'key_type',
    validate: {
      isIn: [['rsa', 'ed25519', 'ecdsa']]
    }
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
  }
  }, {
  tableName: 'git_ssh_keys',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['fingerprint'], unique: true }
  ]
  });

  return GitSSHKey;
};
