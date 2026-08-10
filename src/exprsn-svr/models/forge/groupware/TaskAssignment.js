const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const TaskAssignment = sequelize.define('TaskAssignment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  taskId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'task_id'
  },
  assignedToId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'assigned_to_id',
    comment: 'User or team ID'
  },
  assigneeType: {
    type: DataTypes.ENUM('user', 'team', 'role'),
    allowNull: false,
    defaultValue: 'user',
    field: 'assignee_type'
  },
  assignedById: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'assigned_by_id'
  },
  // Assignment details
  role: {
    type: DataTypes.ENUM('owner', 'contributor', 'reviewer', 'observer'),
    allowNull: false,
    defaultValue: 'contributor'
  },
  isPrimary: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_primary',
    comment: 'Primary assignee responsible for the task'
  },
  // Status
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'declined', 'reassigned', 'completed'),
    allowNull: false,
    defaultValue: 'pending'
  },
  acceptedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'accepted_at'
  },
  declinedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'declined_at'
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_at'
  },
  declineReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'decline_reason'
  },
  // Time tracking
  estimatedHours: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'estimated_hours'
  },
  actualHours: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'actual_hours'
  },
  // Workload allocation
  allocationPercentage: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'allocation_percentage',
    comment: 'Percentage of work assigned to this person'
  },
  // Routing information
  routedFromId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'routed_from_id',
    comment: 'Previous assignee if task was routed'
  },
  routingReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'routing_reason'
  },
  autoRouted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'auto_routed',
    comment: 'Was this assignment made by auto-routing?'
  },
  routingRuleId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'routing_rule_id',
    comment: 'ID of the routing rule that assigned this task'
  },
  // Notifications
  notificationSent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'notification_sent'
  },
  reminderSent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'reminder_sent'
  },
  // Workflow integration
  onAssignWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_assign_workflow_id'
  },
  onAcceptWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_accept_workflow_id'
  },
  onCompleteWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_complete_workflow_id'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
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
  tableName: 'task_assignments',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['task_id']
    },
    {
      fields: ['assigned_to_id']
    },
    {
      fields: ['assigned_by_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['is_primary']
    },
    {
      fields: ['role']
    },
    {
      fields: ['routing_rule_id']
    }
  ]
});

module.exports = TaskAssignment;
