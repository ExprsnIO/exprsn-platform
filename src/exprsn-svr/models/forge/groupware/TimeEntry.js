const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const TimeEntry = sequelize.define('TimeEntry', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // What is being tracked
  taskId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'task_id',
    comment: 'Task being worked on'
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'project_id',
    comment: 'Project this time belongs to'
  },
  activityType: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'activity_type',
    comment: 'Type of work: development, meeting, review, etc.'
  },
  // Who tracked the time
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id'
  },
  // Time tracking
  startTime: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'start_time'
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_time',
    comment: 'Null if timer is still running'
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Duration in seconds (calculated when timer stops)'
  },
  // Manual vs automatic tracking
  isManual: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_manual',
    comment: 'True if manually logged, false if from timer'
  },
  isRunning: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_running',
    comment: 'True if timer is currently running'
  },
  // Billing information
  isBillable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_billable'
  },
  hourlyRate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'hourly_rate',
    comment: 'Rate for this specific time entry'
  },
  billedAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'billed_amount',
    comment: 'Calculated: (duration / 3600) * hourlyRate'
  },
  // Invoice tracking
  invoiceId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'invoice_id',
    comment: 'Invoice this time entry was billed on'
  },
  invoicedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'invoiced_at'
  },
  // Description and notes
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Internal notes, not shown on invoice'
  },
  // Tags and categorization
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },
  // Location tracking (optional)
  location: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Office, Remote, Client Site, etc.'
  },
  // Approval workflow
  status: {
    type: DataTypes.ENUM('draft', 'submitted', 'approved', 'rejected', 'invoiced'),
    allowNull: false,
    defaultValue: 'draft'
  },
  submittedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'submitted_at'
  },
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
  rejectedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'rejected_at'
  },
  rejectedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'rejected_by_id'
  },
  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'rejection_reason'
  },
  // Break time tracking
  breakDuration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'break_duration',
    comment: 'Break time in seconds (excluded from billable time)'
  },
  // Metadata
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
  tableName: 'time_entries',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['task_id']
    },
    {
      fields: ['project_id']
    },
    {
      fields: ['start_time']
    },
    {
      fields: ['end_time']
    },
    {
      fields: ['is_running']
    },
    {
      fields: ['is_billable']
    },
    {
      fields: ['status']
    },
    {
      fields: ['invoice_id']
    },
    {
      fields: ['user_id', 'start_time']
    },
    {
      fields: ['user_id', 'is_running'],
      comment: 'Find active timer for user'
    },
    {
      fields: ['activity_type']
    }
  ]
});

module.exports = TimeEntry;
