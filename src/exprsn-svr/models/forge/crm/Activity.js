const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Activity = sequelize.define('Activity', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  subject: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  activityType: {
    type: DataTypes.ENUM('call', 'email', 'meeting', 'task', 'note', 'deadline', 'sms', 'social'),
    allowNull: false,
    field: 'activity_type'
  },
  status: {
    type: DataTypes.ENUM('planned', 'completed', 'cancelled', 'overdue'),
    allowNull: false,
    defaultValue: 'planned'
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    allowNull: false,
    defaultValue: 'medium'
  },
  direction: {
    type: DataTypes.ENUM('inbound', 'outbound'),
    allowNull: true,
    comment: 'For calls/emails'
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Duration in minutes'
  },
  scheduledAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'scheduled_at'
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_at'
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'due_date'
  },
  // Relationships
  contactId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'contact_id'
  },
  companyId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'company_id'
  },
  leadId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'lead_id'
  },
  opportunityId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'opportunity_id'
  },
  assignedToId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assigned_to_id'
  },
  createdById: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by_id'
  },
  // Additional details
  location: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  attendees: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    defaultValue: [],
    comment: 'Array of user IDs'
  },
  outcome: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Result of the activity'
  },
  nextSteps: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'next_steps'
  },
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of attachment metadata'
  },
  reminderAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'reminder_at'
  },
  reminderSent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'reminder_sent'
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
  tableName: 'activities',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['contact_id']
    },
    {
      fields: ['company_id']
    },
    {
      fields: ['lead_id']
    },
    {
      fields: ['opportunity_id']
    },
    {
      fields: ['assigned_to_id']
    },
    {
      fields: ['created_by_id']
    },
    {
      fields: ['activity_type']
    },
    {
      fields: ['status']
    },
    {
      fields: ['scheduled_at']
    },
    {
      fields: ['due_date']
    }
  ]
});

module.exports = Activity;
