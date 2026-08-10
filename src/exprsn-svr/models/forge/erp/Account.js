const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Account = sequelize.define('Account', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  accountNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'account_number'
  },
  accountName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'account_name'
  },
  accountType: {
    type: DataTypes.ENUM(
      'asset', 'liability', 'equity', 'revenue', 'expense',
      'accounts_receivable', 'accounts_payable', 'cash', 'bank',
      'fixed_asset', 'other_current_asset', 'other_asset',
      'credit_card', 'long_term_liability', 'other_current_liability',
      'cost_of_goods_sold'
    ),
    allowNull: false,
    field: 'account_type'
  },
  parentAccountId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_account_id',
    comment: 'For sub-accounts'
  },
  // Financial properties
  normalBalance: {
    type: DataTypes.ENUM('debit', 'credit'),
    allowNull: false,
    field: 'normal_balance',
    comment: 'Normal balance side for this account type'
  },
  currentBalance: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'current_balance'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  // Classification
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  },
  isSystemAccount: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_system_account'
  },
  // Bank details (if applicable)
  bankName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'bank_name'
  },
  bankAccountNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'bank_account_number'
  },
  bankRoutingNumber: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'bank_routing_number'
  },
  // Tax configuration
  taxAccount: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'tax_account'
  },
  // Description
  description: {
    type: DataTypes.TEXT,
    allowNull: true
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
  tableName: 'accounts',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['account_number'],
      unique: true
    },
    {
      fields: ['account_type']
    },
    {
      fields: ['parent_account_id']
    },
    {
      fields: ['is_active']
    }
  ]
});

module.exports = Account;
