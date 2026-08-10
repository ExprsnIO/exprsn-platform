const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const JournalEntry = sequelize.define('JournalEntry', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  entryNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'entry_number'
  },
  entryDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'entry_date'
  },
  entryType: {
    type: DataTypes.ENUM('manual', 'automatic', 'recurring', 'adjusting', 'closing', 'reversing'),
    allowNull: false,
    defaultValue: 'manual',
    field: 'entry_type'
  },
  // Reference information
  referenceType: {
    type: DataTypes.ENUM('invoice', 'payment', 'expense', 'payroll', 'purchase', 'sale', 'other'),
    allowNull: true,
    field: 'reference_type'
  },
  referenceId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'reference_id',
    comment: 'ID of related invoice, payment, etc.'
  },
  referenceNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'reference_number'
  },
  // Entry details
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  memo: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Line items (debits and credits)
  lineItems: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
    field: 'line_items',
    comment: 'Array of { accountId, accountNumber, accountName, debit, credit, description }'
  },
  // Totals
  totalDebit: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'total_debit'
  },
  totalCredit: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'total_credit'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  // Status and approval
  status: {
    type: DataTypes.ENUM('draft', 'pending_approval', 'approved', 'posted', 'voided', 'reversed'),
    allowNull: false,
    defaultValue: 'draft'
  },
  isPosted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_posted'
  },
  postedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'posted_at'
  },
  postedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'posted_by_id'
  },
  // Approval workflow
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'approved_at'
  },
  approvedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'approved_by_id'
  },
  // Reversing entries
  isReversed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_reversed'
  },
  reversedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'reversed_at'
  },
  reversingEntryId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'reversing_entry_id',
    comment: 'ID of entry that reverses this one'
  },
  reversedEntryId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'reversed_entry_id',
    comment: 'ID of entry that this reverses'
  },
  // Recurring entries
  isRecurring: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_recurring'
  },
  recurringFrequency: {
    type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'quarterly', 'annually'),
    allowNull: true,
    field: 'recurring_frequency'
  },
  nextRecurringDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'next_recurring_date'
  },
  // Fiscal period
  fiscalYear: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'fiscal_year'
  },
  fiscalPeriod: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'fiscal_period',
    comment: 'Month number (1-12) or quarter (1-4)'
  },
  // Audit trail
  createdById: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by_id'
  },
  modifiedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'modified_by_id'
  },
  // Attachments
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
  tableName: 'journal_entries',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['entry_number'],
      unique: true
    },
    {
      fields: ['entry_date']
    },
    {
      fields: ['entry_type']
    },
    {
      fields: ['status']
    },
    {
      fields: ['is_posted']
    },
    {
      fields: ['reference_type', 'reference_id']
    },
    {
      fields: ['fiscal_year', 'fiscal_period']
    },
    {
      fields: ['created_by_id']
    }
  ]
});

module.exports = JournalEntry;
