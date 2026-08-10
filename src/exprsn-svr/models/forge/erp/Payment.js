const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  paymentNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'payment_number'
  },
  paymentDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'payment_date'
  },
  paymentType: {
    type: DataTypes.ENUM('customer_payment', 'vendor_payment', 'expense', 'refund', 'transfer'),
    allowNull: false,
    field: 'payment_type'
  },
  // Payer/Payee information
  customerId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'customer_id'
  },
  supplierId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'supplier_id'
  },
  employeeId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'employee_id'
  },
  payerName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'payer_name'
  },
  // Payment details
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  exchangeRate: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: true,
    field: 'exchange_rate',
    comment: 'If currency conversion needed'
  },
  // Payment method
  paymentMethod: {
    type: DataTypes.ENUM('cash', 'check', 'credit_card', 'debit_card', 'bank_transfer', 'ach', 'wire', 'paypal', 'stripe', 'other'),
    allowNull: false,
    field: 'payment_method'
  },
  paymentMethodDetails: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'payment_method_details',
    comment: '{ checkNumber, cardLastFour, transactionId, etc. }'
  },
  // Banking
  depositToAccountId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'deposit_to_account_id',
    comment: 'Bank account where payment was deposited'
  },
  // Applied to invoices/bills
  appliedTo: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
    field: 'applied_to',
    comment: 'Array of { invoiceId, invoiceNumber, amount }'
  },
  // Unapplied amount (overpayment or prepayment)
  unappliedAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'unapplied_amount'
  },
  // Status
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled', 'refunded'),
    allowNull: false,
    defaultValue: 'pending'
  },
  isReconciled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_reconciled'
  },
  reconciledAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'reconciled_at'
  },
  // Gateway/processor information
  gatewayProvider: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'gateway_provider',
    comment: 'Stripe, PayPal, etc.'
  },
  gatewayTransactionId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'gateway_transaction_id'
  },
  gatewayResponse: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'gateway_response'
  },
  // Fees
  processingFee: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'processing_fee'
  },
  // Journal entry linkage
  journalEntryId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'journal_entry_id',
    comment: 'Linked journal entry for this payment'
  },
  // Refund tracking
  isRefund: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_refund'
  },
  refundedPaymentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'refunded_payment_id',
    comment: 'Original payment if this is a refund'
  },
  refundedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'refunded_at'
  },
  refundReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'refund_reason'
  },
  // Description and notes
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  internalNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'internal_notes'
  },
  // Audit trail
  receivedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'received_by_id'
  },
  processedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'processed_by_id'
  },
  // Attachments
  receiptUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'receipt_url'
  },
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { fileName, url, uploadedAt }'
  },
  // Metadata
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
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
  tableName: 'payments',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['payment_number'],
      unique: true
    },
    {
      fields: ['payment_date']
    },
    {
      fields: ['payment_type']
    },
    {
      fields: ['customer_id']
    },
    {
      fields: ['supplier_id']
    },
    {
      fields: ['employee_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['payment_method']
    },
    {
      fields: ['is_reconciled']
    },
    {
      fields: ['deposit_to_account_id']
    },
    {
      fields: ['gateway_transaction_id']
    }
  ]
});

module.exports = Payment;
