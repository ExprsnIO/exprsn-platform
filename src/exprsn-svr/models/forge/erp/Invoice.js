const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Invoice = sequelize.define('Invoice', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  invoiceNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'invoice_number'
  },
  customerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'customer_id'
  },
  invoiceDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'invoice_date'
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'due_date'
  },
  status: {
    type: DataTypes.ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'),
    allowNull: false,
    defaultValue: 'draft'
  },
  subtotal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  taxAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'tax_amount'
  },
  discountAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'discount_amount'
  },
  total: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  amountPaid: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'amount_paid'
  },
  amountDue: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'amount_due'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  terms: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  paidAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'paid_at'
  },
  lineItems: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
    field: 'line_items'
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
  tableName: 'invoices',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['invoice_number'],
      unique: true
    },
    {
      fields: ['customer_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['invoice_date']
    },
    {
      fields: ['due_date']
    }
  ]
});

module.exports = Invoice;
