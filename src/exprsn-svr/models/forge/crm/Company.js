const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Company = sequelize.define('Company', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  legalName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'legal_name'
  },
  industry: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  website: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  fax: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  taxId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'tax_id'
  },
  employeeCount: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'employee_count'
  },
  annualRevenue: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'annual_revenue'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: true,
    defaultValue: 'USD'
  },
  billingAddress: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'billing_address',
    comment: '{ line1, line2, city, state, postalCode, country }'
  },
  shippingAddress: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'shipping_address',
    comment: '{ line1, line2, city, state, postalCode, country }'
  },
  parentCompanyId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_company_id'
  },
  accountType: {
    type: DataTypes.ENUM('prospect', 'customer', 'partner', 'vendor', 'competitor', 'former_customer'),
    allowNull: false,
    defaultValue: 'prospect',
    field: 'account_type'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'archived'),
    allowNull: false,
    defaultValue: 'active'
  },
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'owner_id'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  socialProfiles: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'social_profiles',
    comment: '{ linkedin, twitter, facebook, etc. }'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },
  customFields: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    field: 'custom_fields'
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
  tableName: 'companies',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['name']
    },
    {
      fields: ['owner_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['account_type']
    },
    {
      fields: ['industry']
    },
    {
      fields: ['parent_company_id']
    }
  ]
});

module.exports = Company;
