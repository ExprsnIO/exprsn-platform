const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Campaign = sequelize.define('Campaign', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  campaignType: {
    type: DataTypes.ENUM('email', 'social', 'webinar', 'event', 'content', 'advertising', 'direct_mail', 'telemarketing', 'other'),
    allowNull: false,
    field: 'campaign_type'
  },
  status: {
    type: DataTypes.ENUM('planning', 'active', 'paused', 'completed', 'cancelled'),
    allowNull: false,
    defaultValue: 'planning'
  },
  // Dates
  startDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'start_date'
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_date'
  },
  // Budget and costs
  budget: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  actualCost: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'actual_cost'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: true,
    defaultValue: 'USD'
  },
  // Goals and metrics
  goalType: {
    type: DataTypes.ENUM('leads', 'revenue', 'awareness', 'engagement', 'conversion', 'custom'),
    allowNull: true,
    field: 'goal_type'
  },
  goalValue: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'goal_value'
  },
  expectedRevenue: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'expected_revenue'
  },
  expectedLeads: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'expected_leads'
  },
  // Performance tracking
  totalSent: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_sent'
  },
  totalOpened: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_opened'
  },
  totalClicked: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_clicked'
  },
  totalResponses: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_responses'
  },
  totalLeadsGenerated: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_leads_generated'
  },
  totalConversions: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_conversions'
  },
  totalRevenue: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'total_revenue'
  },
  // Targeting
  targetAudience: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'target_audience'
  },
  segmentCriteria: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'segment_criteria',
    comment: 'Criteria for audience segmentation'
  },
  // Content
  emailTemplate: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'email_template'
  },
  landingPageUrl: {
    type: DataTypes.STRING(1000),
    allowNull: true,
    field: 'landing_page_url'
  },
  callToAction: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'call_to_action'
  },
  // Ownership
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'owner_id'
  },
  teamMembers: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    field: 'team_members'
  },
  // Workflow integration
  onLaunchWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_launch_workflow_id'
  },
  onCompleteWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_complete_workflow_id'
  },
  onResponseWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_response_workflow_id'
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
  tableName: 'campaigns',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['owner_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['campaign_type']
    },
    {
      fields: ['start_date', 'end_date']
    }
  ]
});

module.exports = Campaign;
