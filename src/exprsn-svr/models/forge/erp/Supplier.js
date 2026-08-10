const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Supplier = sequelize.define('Supplier', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  supplierNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'supplier_number'
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
  // Contact information
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
  website: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  // Address
  billingAddress: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'billing_address'
  },
  shippingAddress: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'shipping_address'
  },
  // Business details
  taxId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'tax_id'
  },
  businessType: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'business_type'
  },
  industry: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  // Payment terms
  paymentTerms: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'payment_terms'
  },
  paymentMethod: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'payment_method'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  creditLimit: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'credit_limit'
  },
  // Contact persons
  primaryContactId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'primary_contact_id',
    comment: 'Link to CRM Contact'
  },
  accountsPayableContactId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'accounts_payable_contact_id'
  },
  // Status
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended', 'archived'),
    allowNull: false,
    defaultValue: 'active'
  },
  isPreferred: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_preferred'
  },
  // Performance metrics
  rating: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '1-5 rating'
  },
  onTimeDeliveryRate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'on_time_delivery_rate',
    comment: 'Percentage'
  },
  qualityScore: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'quality_score'
  },
  totalOrdersCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_orders_count'
  },
  totalOrdersValue: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'total_orders_value'
  },
  lastOrderDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_order_date'
  },
  // Lead time
  averageLeadTimeDays: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'average_lead_time_days'
  },
  minimumOrderValue: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'minimum_order_value'
  },
  // Certifications
  certifications: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { name, issuedBy, expiryDate }'
  },
  // Insurance
  insuranceProvider: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'insurance_provider'
  },
  insurancePolicyNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'insurance_policy_number'
  },
  insuranceExpiryDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'insurance_expiry_date'
  },
  // Bank details
  bankDetails: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'bank_details',
    comment: '{ bankName, accountNumber, routingNumber, swift }'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
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
  tableName: 'suppliers',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['supplier_number'],
      unique: true
    },
    {
      fields: ['name']
    },
    {
      fields: ['status']
    },
    {
      fields: ['is_preferred']
    },
    {
      fields: ['primary_contact_id']
    }
  ]
});

module.exports = Supplier;
