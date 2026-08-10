const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const MaintenanceSchedule = sequelize.define('MaintenanceSchedule', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  scheduleNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'schedule_number'
  },
  assetId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'asset_id',
    references: {
      model: 'assets',
      key: 'id'
    }
  },
  // Maintenance details
  maintenanceType: {
    type: DataTypes.ENUM('preventive', 'inspection', 'repair', 'calibration', 'replacement', 'cleaning', 'upgrade', 'other'),
    allowNull: false,
    field: 'maintenance_type'
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Schedule
  isRecurring: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_recurring'
  },
  frequency: {
    type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'quarterly', 'semi_annually', 'annually', 'one_time'),
    allowNull: false,
    defaultValue: 'one_time'
  },
  frequencyInterval: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'frequency_interval',
    comment: 'Every N days/weeks/months'
  },
  // Dates
  startDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'start_date'
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_date'
  },
  nextDueDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'next_due_date'
  },
  lastCompletedDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_completed_date'
  },
  // Assignment
  assignedToEmployeeId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assigned_to_employee_id'
  },
  assignedToDepartmentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assigned_to_department_id'
  },
  assignedToVendor: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'assigned_to_vendor'
  },
  // Estimated costs and time
  estimatedCost: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'estimated_cost'
  },
  estimatedDuration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'estimated_duration',
    comment: 'Estimated duration in minutes'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  // Priority and status
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    allowNull: false,
    defaultValue: 'medium'
  },
  status: {
    type: DataTypes.ENUM('active', 'completed', 'cancelled', 'suspended'),
    allowNull: false,
    defaultValue: 'active'
  },
  // Checklist and procedures
  checklist: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { task, completed, notes }'
  },
  procedures: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Step-by-step maintenance procedures'
  },
  safetyNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'safety_notes'
  },
  // Required parts and tools
  requiredParts: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'required_parts',
    comment: 'Array of { partNumber, name, quantity }'
  },
  requiredTools: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'required_tools',
    comment: 'Array of tool names'
  },
  // Downtime
  requiresDowntime: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'requires_downtime'
  },
  estimatedDowntime: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'estimated_downtime',
    comment: 'Estimated downtime in minutes'
  },
  // Notifications
  reminderDaysBefore: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'reminder_days_before',
    comment: 'Send reminder N days before due date'
  },
  notificationsSent: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'notifications_sent',
    comment: 'Track sent notifications'
  },
  // Completion tracking
  completionCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'completion_count',
    comment: 'Number of times completed'
  },
  completionHistory: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'completion_history',
    comment: 'Array of { date, performedBy, duration, cost, notes }'
  },
  // Workflow integration
  onDueWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_due_workflow_id'
  },
  onCompleteWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_complete_workflow_id'
  },
  // Documentation
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { fileName, url, type, uploadedAt }'
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
  tableName: 'maintenance_schedules',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['schedule_number'],
      unique: true
    },
    {
      fields: ['asset_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['next_due_date']
    },
    {
      fields: ['assigned_to_employee_id']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['maintenance_type']
    }
  ]
});

module.exports = MaintenanceSchedule;
