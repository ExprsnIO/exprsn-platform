/**
 * ═══════════════════════════════════════════════════════════════════════
 * AcmeAuthorization Model - ACME (RFC 8555 §7.1.4) authorizations
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const AcmeAuthorization = sequelize.define('AcmeAuthorization', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'order_id',
      references: {
        model: 'acme_orders',
        key: 'id'
      }
    },
    accountId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'account_id',
      references: {
        model: 'acme_accounts',
        key: 'id'
      }
    },
    identifier: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: '{ type, value } identifier object (value without wildcard prefix)'
    },
    wildcard: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'valid', 'invalid', 'deactivated', 'expired', 'revoked'),
      allowNull: false,
      defaultValue: 'pending'
    },
    expires: {
      type: DataTypes.DATE,
      allowNull: false
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
    tableName: 'acme_authorizations',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['order_id'] },
      { fields: ['account_id'] },
      { fields: ['status'] }
    ]
  });

  return AcmeAuthorization;
};
