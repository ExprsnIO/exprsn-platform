/**
 * ═══════════════════════════════════════════════════════════════════════
 * AcmeChallenge Model - ACME (RFC 8555 §8) challenges
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const AcmeChallenge = sequelize.define('AcmeChallenge', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    authorizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'authorization_id',
      references: {
        model: 'acme_authorizations',
        key: 'id'
      }
    },
    type: {
      type: DataTypes.ENUM('http-01', 'dns-01'),
      allowNull: false
    },
    token: {
      type: DataTypes.STRING(128),
      allowNull: false,
      comment: 'base64url challenge token'
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'valid', 'invalid'),
      allowNull: false,
      defaultValue: 'pending'
    },
    validated: {
      type: DataTypes.DATE,
      allowNull: true
    },
    error: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'RFC 7807 problem document if validation failed'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  }, {
    tableName: 'acme_challenges',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['authorization_id'] },
      { fields: ['token'] },
      { fields: ['status'] }
    ]
  });

  return AcmeChallenge;
};
