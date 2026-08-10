const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Service = sequelize.define('Service', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  sku: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  serviceType: {
    type: DataTypes.ENUM('consulting', 'support', 'maintenance', 'training', 'implementation', 'subscription', 'custom'),
    allowNull: false,
    field: 'service_type'
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'discontinued'),
    allowNull: false,
    defaultValue: 'active'
  },
  // Pricing
  pricingModel: {
    type: DataTypes.ENUM('fixed', 'hourly', 'daily', 'monthly', 'annual', 'per_user', 'tiered', 'custom'),
    allowNull: false,
    defaultValue: 'fixed',
    field: 'pricing_model'
  },
  basePrice: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'base_price'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  tieredPricing: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'tiered_pricing',
    comment: 'Array of { minQuantity, maxQuantity, price }'
  },
  // Service delivery
  deliveryMethod: {
    type: DataTypes.ENUM('on_site', 'remote', 'hybrid', 'cloud', 'self_service'),
    allowNull: true,
    field: 'delivery_method'
  },
  estimatedDuration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'estimated_duration',
    comment: 'Duration in hours'
  },
  durationUnit: {
    type: DataTypes.ENUM('hours', 'days', 'weeks', 'months'),
    allowNull: true,
    defaultValue: 'hours',
    field: 'duration_unit'
  },
  // SLA defaults
  defaultSlaId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'default_sla_id',
    comment: 'Default SLA for this service'
  },
  responseTimeMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'response_time_minutes'
  },
  resolutionTimeMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'resolution_time_minutes'
  },
  // Availability
  available24x7: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'available_24x7'
  },
  operatingHours: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'operating_hours',
    comment: '{ monday: { start: "09:00", end: "17:00" }, ... }'
  },
  // Requirements
  prerequisites: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  deliverables: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of deliverable items'
  },
  // Billing
  billable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  taxable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  taxRate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'tax_rate'
  },
  // Resources
  requiredSkills: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    field: 'required_skills'
  },
  assignedTeamIds: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    field: 'assigned_team_ids',
    comment: 'Teams that can deliver this service'
  },
  // Contract integration
  contractTemplate: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'contract_template'
  },
  defaultContractTermMonths: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'default_contract_term_months'
  },
  // Add-ons and dependencies
  allowAddOns: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'allow_add_ons'
  },
  addOnServiceIds: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    field: 'add_on_service_ids',
    comment: 'Services that can be added to this service'
  },
  requiredServiceIds: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    field: 'required_service_ids',
    comment: 'Services that must be purchased first'
  },
  // Performance tracking
  averageRating: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    field: 'average_rating'
  },
  totalSales: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_sales'
  },
  activeSubscriptions: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'active_subscriptions'
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
  tableName: 'services',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['sku'],
      unique: true
    },
    {
      fields: ['service_type']
    },
    {
      fields: ['category']
    },
    {
      fields: ['status']
    },
    {
      fields: ['pricing_model']
    },
    {
      fields: ['default_sla_id']
    }
  ]
});

module.exports = Service;
