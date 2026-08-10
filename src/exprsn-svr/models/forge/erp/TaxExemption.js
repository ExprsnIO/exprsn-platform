const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

/**
 * TaxExemption Model
 *
 * Manages tax exemptions for customers, products, or transactions.
 * Supports certificate-based exemptions with expiry tracking.
 */
const TaxExemption = sequelize.define('TaxExemption', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  exemptionNumber: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    field: 'exemption_number',
    comment: 'Unique exemption certificate number'
  },
  entityType: {
    type: DataTypes.ENUM('customer', 'product', 'transaction', 'category'),
    allowNull: false,
    field: 'entity_type',
    comment: 'Type of entity this exemption applies to'
  },
  entityId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'entity_id',
    comment: 'ID of the entity (customer, product, etc.)'
  },
  exemptionType: {
    type: DataTypes.ENUM('full', 'partial', 'specific_tax'),
    allowNull: false,
    defaultValue: 'full',
    field: 'exemption_type',
    comment: 'Full exemption, partial exemption, or specific tax exemption'
  },
  taxRateIds: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    field: 'tax_rate_ids',
    comment: 'Specific tax rates this exemption applies to (for specific_tax type)'
  },
  reason: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Reason for exemption (e.g., "Non-profit organization", "Government entity")'
  },
  certificateNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'certificate_number',
    comment: 'Tax exemption certificate number'
  },
  issuingAuthority: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'issuing_authority',
    comment: 'Authority that issued the exemption certificate'
  },
  country: {
    type: DataTypes.STRING(2),
    allowNull: true,
    comment: 'ISO 3166-1 alpha-2 country code'
  },
  state: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'State/province/region where exemption is valid'
  },
  effectiveFrom: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'effective_from',
    comment: 'Date when exemption becomes effective'
  },
  effectiveTo: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'effective_to',
    comment: 'Date when exemption expires'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  },
  autoRenew: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'auto_renew',
    comment: 'Whether exemption auto-renews or requires manual renewal'
  },
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Attached documents (certificate scans, etc.): [{ name, url, uploadedAt }]'
  },
  conditions: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Conditions for exemption applicability'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'updated_at'
  }
}, {
  tableName: 'tax_exemptions',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['exemption_number'],
      unique: true
    },
    {
      fields: ['entity_type', 'entity_id']
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['effective_from', 'effective_to']
    },
    {
      fields: ['country', 'state']
    }
  ]
});

module.exports = TaxExemption;
