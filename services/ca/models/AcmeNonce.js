/**
 * ═══════════════════════════════════════════════════════════════════════
 * AcmeNonce Model - single-use ACME replay nonces (RFC 8555 §6.5)
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = (sequelize, DataTypes) => {
  const AcmeNonce = sequelize.define('AcmeNonce', {
    nonce: {
      type: DataTypes.STRING(64),
      primaryKey: true,
      allowNull: false,
      comment: 'base64url nonce value'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at'
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
    tableName: 'acme_nonces',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['expires_at'] }
    ]
  });

  return AcmeNonce;
};
