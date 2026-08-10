const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Project = sequelize.define('Project', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  projectNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'project_number'
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  projectType: {
    type: DataTypes.ENUM('internal', 'client', 'research', 'maintenance', 'product'),
    allowNull: false,
    defaultValue: 'internal',
    field: 'project_type'
  },
  // Status and priority
  status: {
    type: DataTypes.ENUM('planning', 'active', 'on_hold', 'completed', 'cancelled'),
    allowNull: false,
    defaultValue: 'planning'
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    allowNull: false,
    defaultValue: 'medium'
  },
  health: {
    type: DataTypes.ENUM('on_track', 'at_risk', 'off_track'),
    allowNull: true
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
  actualStartDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'actual_start_date'
  },
  actualEndDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'actual_end_date'
  },
  // Budget
  budget: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  actualCost: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'actual_cost'
  },
  estimatedCost: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'estimated_cost'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  billingType: {
    type: DataTypes.ENUM('fixed_price', 'time_and_materials', 'retainer', 'non_billable'),
    allowNull: true,
    defaultValue: 'non_billable',
    field: 'billing_type'
  },
  // Client/Customer
  customerId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'customer_id'
  },
  companyId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'company_id',
    comment: 'Link to CRM Company'
  },
  opportunityId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'opportunity_id',
    comment: 'Link to CRM Opportunity'
  },
  // Team
  projectManagerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'project_manager_id'
  },
  teamMembers: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    field: 'team_members',
    comment: 'Array of employee IDs'
  },
  departmentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'department_id'
  },
  // Progress tracking
  completionPercentage: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'completion_percentage'
  },
  totalTasks: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_tasks'
  },
  completedTasks: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'completed_tasks'
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
  // Milestones
  milestones: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { name, date, status, completedDate }'
  },
  // Risks and issues
  risks: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { description, severity, mitigation, status }'
  },
  issues: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { description, priority, assignedTo, status }'
  },
  // Deliverables
  deliverables: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { name, description, dueDate, status }'
  },
  // Workflow integration
  onStartWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_start_workflow_id'
  },
  onCompleteWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_complete_workflow_id'
  },
  onMilestoneWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_milestone_workflow_id'
  },
  // Tags and categories
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
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
  tableName: 'projects',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['project_number'],
      unique: true
    },
    {
      fields: ['project_manager_id']
    },
    {
      fields: ['customer_id']
    },
    {
      fields: ['company_id']
    },
    {
      fields: ['opportunity_id']
    },
    {
      fields: ['department_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['project_type']
    },
    {
      fields: ['start_date', 'end_date']
    }
  ]
});

module.exports = Project;
