const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

/**
 * CreditNote Model
 *
 * Represents credit notes (refund documents) issued to customers.
 * Used to reduce or cancel invoices, process returns, and correct billing errors.
 */
const CreditNote = sequelize.define('CreditNote', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  creditNoteNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'credit_note_number',
    comment: 'Unique credit note number (e.g., CN-2024-0001)'
  },
  invoiceId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'invoice_id',
    comment: 'Original invoice being credited (if applicable)'
  },
  customerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'customer_id'
  },
  issueDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'issue_date'
  },
  status: {
    type: DataTypes.ENUM('draft', 'issued', 'applied', 'void'),
    allowNull: false,
    defaultValue: 'draft',
    comment: 'draft: not yet issued, issued: sent to customer, applied: applied to invoice, void: cancelled'
  },
  reason: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'Reason for issuing credit note'
  },
  creditType: {
    type: DataTypes.ENUM('full_refund', 'partial_refund', 'price_adjustment', 'return', 'error_correction', 'discount', 'other'),
    allowNull: false,
    field: 'credit_type',
    comment: 'Type of credit being issued'
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
  total: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  appliedAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'applied_amount',
    comment: 'Amount already applied to invoices'
  },
  remainingBalance: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'remaining_balance',
    comment: 'Amount still available for application'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  lineItems: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
    field: 'line_items',
    comment: 'Line items: [{ productId, description, quantity, unitPrice, total, taxAmount }]'
  },
  refundMethod: {
    type: DataTypes.ENUM('original_payment', 'bank_transfer', 'check', 'cash', 'store_credit', 'none'),
    allowNull: true,
    field: 'refund_method',
    comment: 'How the refund will be processed'
  },
  refundStatus: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'not_applicable'),
    allowNull: false,
    defaultValue: 'not_applicable',
    field: 'refund_status'
  },
  refundedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'refunded_at'
  },
  refundReference: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'refund_reference',
    comment: 'Reference number for refund transaction'
  },
  applications: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Applications to invoices: [{ invoiceId, amount, appliedAt }]'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  internalNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'internal_notes',
    comment: 'Internal notes not visible to customer'
  },
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Attached documents: [{ name, url, uploadedAt }]'
  },
  createdById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'created_by_id'
  },
  approvedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'approved_by_id'
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'approved_at'
  },
  voidedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'voided_by_id'
  },
  voidedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'voided_at'
  },
  voidReason: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'void_reason'
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
  tableName: 'credit_notes',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['credit_note_number'],
      unique: true
    },
    {
      fields: ['customer_id']
    },
    {
      fields: ['invoice_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['issue_date']
    },
    {
      fields: ['credit_type']
    }
  ]
});

module.exports = CreditNote;
