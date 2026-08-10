const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Contract = sequelize.define('Contract', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  contractNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'contract_number'
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  contractType: {
    type: DataTypes.ENUM('service', 'subscription', 'license', 'support', 'maintenance', 'consulting', 'custom'),
    allowNull: false,
    field: 'contract_type'
  },
  status: {
    type: DataTypes.ENUM('draft', 'pending_approval', 'active', 'expired', 'renewed', 'cancelled', 'terminated'),
    allowNull: false,
    defaultValue: 'draft'
  },
  // Parties
  companyId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'company_id',
    comment: 'Customer company'
  },
  contactId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'contact_id',
    comment: 'Primary contact for contract'
  },
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'owner_id',
    comment: 'Account manager/owner'
  },
  // Dates
  startDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'start_date'
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'end_date'
  },
  signedDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'signed_date'
  },
  renewalDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'renewal_date'
  },
  cancelledDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'cancelled_date'
  },
  // Financial terms
  contractValue: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'contract_value'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  billingFrequency: {
    type: DataTypes.ENUM('one_time', 'monthly', 'quarterly', 'semi_annual', 'annual', 'custom'),
    allowNull: false,
    defaultValue: 'monthly',
    field: 'billing_frequency'
  },
  paymentTerms: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'payment_terms',
    comment: 'e.g., Net 30, Net 60'
  },
  // Renewal terms
  autoRenewal: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'auto_renewal'
  },
  renewalNoticeDays: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'renewal_notice_days',
    comment: 'Days before renewal to notify'
  },
  renewalTermMonths: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'renewal_term_months',
    comment: 'Length of renewal term'
  },
  // Cancellation terms
  cancellationNoticeDays: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'cancellation_notice_days'
  },
  earlyTerminationFee: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'early_termination_fee'
  },
  cancellationReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'cancellation_reason'
  },
  // Legal terms
  governingLaw: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'governing_law'
  },
  jurisdiction: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  // Documents
  documentUrl: {
    type: DataTypes.STRING(1000),
    allowNull: true,
    field: 'document_url'
  },
  signedDocumentUrl: {
    type: DataTypes.STRING(1000),
    allowNull: true,
    field: 'signed_document_url'
  },
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of attachment metadata'
  },
  // Services included
  services: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of { serviceId, quantity, price }'
  },
  // Notifications
  notifyRenewal: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'notify_renewal'
  },
  notifyExpiration: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'notify_expiration'
  },
  renewalNotificationSent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'renewal_notification_sent'
  },
  expirationNotificationSent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'expiration_notification_sent'
  },
  // Workflow integration
  onSignedWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_signed_workflow_id'
  },
  onRenewalWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_renewal_workflow_id'
  },
  onExpirationWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_expiration_workflow_id'
  },
  // Additional fields
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  terms: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Contract terms and conditions'
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
  tableName: 'contracts',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['contract_number'],
      unique: true
    },
    {
      fields: ['company_id']
    },
    {
      fields: ['contact_id']
    },
    {
      fields: ['owner_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['contract_type']
    },
    {
      fields: ['start_date', 'end_date']
    },
    {
      fields: ['renewal_date']
    }
  ]
});

module.exports = Contract;
