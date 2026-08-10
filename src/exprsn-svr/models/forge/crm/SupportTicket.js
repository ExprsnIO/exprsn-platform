const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const SupportTicket = sequelize.define('SupportTicket', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ticketNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'ticket_number'
  },
  subject: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  // Categorization
  category: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  subcategory: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  ticketType: {
    type: DataTypes.ENUM('incident', 'request', 'question', 'problem', 'change'),
    allowNull: false,
    defaultValue: 'incident',
    field: 'ticket_type'
  },
  // Priority and severity
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent', 'critical'),
    allowNull: false,
    defaultValue: 'medium'
  },
  severity: {
    type: DataTypes.ENUM('minor', 'moderate', 'major', 'critical'),
    allowNull: true
  },
  impact: {
    type: DataTypes.ENUM('low', 'medium', 'high'),
    allowNull: true,
    comment: 'Business impact'
  },
  // Status
  status: {
    type: DataTypes.ENUM('new', 'open', 'in_progress', 'pending_customer', 'pending_vendor', 'on_hold', 'resolved', 'closed', 'cancelled'),
    allowNull: false,
    defaultValue: 'new'
  },
  resolution: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  resolutionType: {
    type: DataTypes.ENUM('fixed', 'workaround', 'duplicate', 'cannot_reproduce', 'not_a_bug', 'wont_fix', 'other'),
    allowNull: true,
    field: 'resolution_type'
  },
  // Relationships
  contactId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'contact_id',
    comment: 'Person who reported the issue'
  },
  companyId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'company_id'
  },
  assignedToId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assigned_to_id'
  },
  assignedTeamId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assigned_team_id'
  },
  createdById: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by_id'
  },
  // SLA tracking
  slaId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'sla_id'
  },
  slaStatus: {
    type: DataTypes.ENUM('on_track', 'at_risk', 'breached', 'paused'),
    allowNull: true,
    defaultValue: 'on_track',
    field: 'sla_status'
  },
  firstResponseDue: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'first_response_due'
  },
  firstRespondedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'first_responded_at'
  },
  resolutionDue: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'resolution_due'
  },
  resolvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'resolved_at'
  },
  closedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'closed_at'
  },
  slaBreachCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'sla_breach_count'
  },
  // Time tracking
  timeSpentMinutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'time_spent_minutes'
  },
  estimatedTimeMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'estimated_time_minutes'
  },
  // Customer communication
  source: {
    type: DataTypes.ENUM('email', 'phone', 'chat', 'web', 'portal', 'social', 'api'),
    allowNull: true,
    defaultValue: 'web'
  },
  channel: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  customerEmail: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'customer_email'
  },
  customerPhone: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'customer_phone'
  },
  // Escalation
  escalated: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  escalatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'escalated_at'
  },
  escalatedToId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'escalated_to_id'
  },
  escalationReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'escalation_reason'
  },
  // Related items
  parentTicketId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_ticket_id',
    comment: 'Parent ticket if this is a subtask'
  },
  relatedTicketIds: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    field: 'related_ticket_ids'
  },
  // Attachments and links
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of attachment metadata'
  },
  externalTicketId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'external_ticket_id',
    comment: 'Ticket ID in external system'
  },
  // Satisfaction
  satisfactionRating: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'satisfaction_rating',
    comment: '1-5 rating'
  },
  satisfactionComment: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'satisfaction_comment'
  },
  // Workflow integration
  onCreateWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_create_workflow_id'
  },
  onAssignWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_assign_workflow_id'
  },
  onEscalateWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_escalate_workflow_id'
  },
  onResolveWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_resolve_workflow_id'
  },
  onBreachWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_breach_workflow_id'
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
  tableName: 'support_tickets',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['ticket_number'],
      unique: true
    },
    {
      fields: ['contact_id']
    },
    {
      fields: ['company_id']
    },
    {
      fields: ['assigned_to_id']
    },
    {
      fields: ['assigned_team_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['sla_id']
    },
    {
      fields: ['sla_status']
    },
    {
      fields: ['first_response_due']
    },
    {
      fields: ['resolution_due']
    },
    {
      fields: ['parent_ticket_id']
    }
  ]
});

module.exports = SupportTicket;
