const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Customer = sequelize.define('Customer', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  customerNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'customer_number'
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
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
  contactId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'contact_id',
    comment: 'Link to CRM Contact'
  },
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
  paymentTerms: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'payment_terms'
  },
  creditLimit: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'credit_limit'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  taxExempt: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'tax_exempt'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended'),
    allowNull: false,
    defaultValue: 'active'
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
  tableName: 'customers',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['customer_number'],
      unique: true
    },
    {
      fields: ['email']
    },
    {
      fields: ['contact_id']
    },
    {
      fields: ['status']
    }
  ]
});

module.exports = Customer;
