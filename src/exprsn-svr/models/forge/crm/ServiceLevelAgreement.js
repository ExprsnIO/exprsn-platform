const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const ServiceLevelAgreement = sequelize.define('ServiceLevelAgreement', {
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
  slaType: {
    type: DataTypes.ENUM('support', 'delivery', 'response', 'resolution', 'uptime', 'custom'),
    allowNull: false,
    field: 'sla_type'
  },
  priority: {
    type: DataTypes.ENUM('critical', 'high', 'medium', 'low'),
    allowNull: false,
    defaultValue: 'medium'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'expired', 'draft'),
    allowNull: false,
    defaultValue: 'draft'
  },
  // Time-based SLA metrics
  responseTimeMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'response_time_minutes',
    comment: 'Maximum time to first response'
  },
  resolutionTimeMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'resolution_time_minutes',
    comment: 'Maximum time to resolve'
  },
  // Operating hours
  operatingHours: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'operating_hours',
    comment: '{ monday: { start: "09:00", end: "17:00" }, ... } or "24/7"'
  },
  timezone: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: 'UTC'
  },
  // Business rules
  businessHoursOnly: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'business_hours_only'
  },
  excludeWeekends: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'exclude_weekends'
  },
  excludeHolidays: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'exclude_holidays'
  },
  // Uptime requirements
  uptimePercentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'uptime_percentage',
    comment: 'e.g., 99.99 for 99.99% uptime'
  },
  // Escalation rules
  escalationEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'escalation_enabled'
  },
  escalationRules: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'escalation_rules',
    comment: 'Array of { level, afterMinutes, notifyUserIds, action }'
  },
  // Breach notifications
  notifyOnBreach: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'notify_on_breach'
  },
  notifyOnWarning: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'notify_on_warning'
  },
  warningThresholdPercent: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 80,
    field: 'warning_threshold_percent',
    comment: 'Warning at X% of SLA time consumed'
  },
  // Relationships
  companyId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'company_id',
    comment: 'Company this SLA applies to'
  },
  contractId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'contract_id',
    comment: 'Contract this SLA is part of'
  },
  // Validity period
  validFrom: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'valid_from'
  },
  validUntil: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'valid_until'
  },
  // Performance tracking
  currentCompliance: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'current_compliance',
    comment: 'Current compliance percentage'
  },
  totalViolations: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_violations'
  },
  lastViolationAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_violation_at'
  },
  // Workflow integration
  onBreachWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_breach_workflow_id',
    comment: 'Workflow to execute on SLA breach'
  },
  onWarningWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_warning_workflow_id',
    comment: 'Workflow to execute on SLA warning'
  },
  // Additional settings
  autoResolveEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'auto_resolve_enabled'
  },
  penaltyClause: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'penalty_clause'
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
  tableName: 'service_level_agreements',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['company_id']
    },
    {
      fields: ['contract_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['sla_type']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['valid_from', 'valid_until']
    }
  ]
});

module.exports = ServiceLevelAgreement;
