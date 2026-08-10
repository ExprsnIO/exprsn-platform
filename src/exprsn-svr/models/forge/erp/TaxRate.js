const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

/**
 * TaxRate Model
 *
 * Manages tax rates for various jurisdictions and tax types.
 * Supports simple taxes (single rate) and compound taxes (tax on tax).
 */
const TaxRate = sequelize.define('TaxRate', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'Unique tax code (e.g., VAT-20, GST-5, SALES-TAX-CA)'
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Display name (e.g., "VAT 20%", "California Sales Tax")'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  taxType: {
    type: DataTypes.ENUM('sales', 'purchase', 'both', 'withholding', 'service', 'excise'),
    allowNull: false,
    defaultValue: 'sales',
    field: 'tax_type',
    comment: 'Type of tax'
  },
  rate: {
    type: DataTypes.DECIMAL(8, 4),
    allowNull: false,
    comment: 'Tax rate (e.g., 20.0000 for 20%)'
  },
  rateType: {
    type: DataTypes.ENUM('percentage', 'fixed'),
    allowNull: false,
    defaultValue: 'percentage',
    field: 'rate_type',
    comment: 'Whether rate is percentage or fixed amount'
  },
  country: {
    type: DataTypes.STRING(2),
    allowNull: true,
    comment: 'ISO 3166-1 alpha-2 country code'
  },
  state: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'State/province/region'
  },
  jurisdiction: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Specific jurisdiction (city, county, etc.)'
  },
  isCompound: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_compound',
    comment: 'Whether this is a compound tax (tax on tax)'
  },
  components: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Tax components for compound taxes: [{ name, rate, order }]'
  },
  applicableOn: {
    type: DataTypes.ENUM('subtotal', 'subtotal_with_discount', 'line_item'),
    allowNull: false,
    defaultValue: 'subtotal',
    field: 'applicable_on',
    comment: 'What the tax is calculated on'
  },
  includedInPrice: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'included_in_price',
    comment: 'Whether tax is included in the price (e.g., VAT in EU)'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  },
  effectiveFrom: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'effective_from',
    comment: 'Date when this tax rate becomes effective'
  },
  effectiveTo: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'effective_to',
    comment: 'Date when this tax rate expires'
  },
  accountId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'account_id',
    comment: 'GL account for tax liability'
  },
  recoverable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether this tax is recoverable (e.g., input VAT)'
  },
  reportingCategory: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'reporting_category',
    comment: 'Category for tax reporting'
  },
  priority: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Priority for automatic tax selection (higher = higher priority)'
  },
  rules: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Custom rules for tax applicability (product types, customer types, etc.)'
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
  tableName: 'tax_rates',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['code'],
      unique: true
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['tax_type']
    },
    {
      fields: ['country', 'state']
    },
    {
      fields: ['effective_from', 'effective_to']
    },
    {
      fields: ['priority']
    }
  ]
});

module.exports = TaxRate;
