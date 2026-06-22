/**
 * ═══════════════════════════════════════════════════════════════════════
 * AcmeAccount Model - ACME (RFC 8555) accounts
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const AcmeAccount = sequelize.define('AcmeAccount', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    keyThumbprint: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
      field: 'key_thumbprint',
      comment: 'RFC 7638 JWK thumbprint (base64url SHA-256)'
    },
    jwk: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Account public key as JWK'
    },
    status: {
      type: DataTypes.ENUM('valid', 'deactivated', 'revoked'),
      allowNull: false,
      defaultValue: 'valid'
    },
    contact: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: []
    },
    termsOfServiceAgreed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'terms_of_service_agreed'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true
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
    tableName: 'acme_accounts',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['key_thumbprint'], unique: true },
      { fields: ['status'] }
    ]
  });

  return AcmeAccount;
};
