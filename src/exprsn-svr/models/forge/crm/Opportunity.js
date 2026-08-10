const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Opportunity = sequelize.define('Opportunity', {
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
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  stage: {
    type: DataTypes.ENUM('prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'),
    allowNull: false,
    defaultValue: 'prospecting'
  },
  probability: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0,
      max: 100
    }
  },
  expectedCloseDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expected_close_date'
  },
  actualCloseDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'actual_close_date'
  },
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
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'owner_id'
  },
  leadSource: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'lead_source'
  },
  lostReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'lost_reason'
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
  tableName: 'opportunities',
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
      fields: ['owner_id']
    },
    {
      fields: ['stage']
    },
    {
      fields: ['expected_close_date']
    }
  ]
});

module.exports = Opportunity;
