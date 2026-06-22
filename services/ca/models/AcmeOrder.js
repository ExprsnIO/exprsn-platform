/**
 * ═══════════════════════════════════════════════════════════════════════
 * AcmeOrder Model - ACME (RFC 8555 §7.1.3) orders
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const AcmeOrder = sequelize.define('AcmeOrder', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
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
    status: {
      type: DataTypes.ENUM('pending', 'ready', 'processing', 'valid', 'invalid'),
      allowNull: false,
      defaultValue: 'pending'
    },
    expires: {
      type: DataTypes.DATE,
      allowNull: false
    },
    identifiers: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: 'Array of { type, value } identifier objects'
    },
    notBefore: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'not_before'
    },
    notAfter: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'not_after'
    },
    certificateId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'certificate_id',
      references: {
        model: 'certificates',
        key: 'id'
      }
    },
    error: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'RFC 7807 problem document if the order failed'
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
    tableName: 'acme_orders',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['account_id'] },
      { fields: ['status'] },
      { fields: ['certificate_id'] },
      { fields: ['expires'] }
    ]
  });

  return AcmeOrder;
};
