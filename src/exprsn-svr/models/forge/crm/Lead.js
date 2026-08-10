const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Lead = sequelize.define('Lead', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  firstName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'first_name'
  },
  lastName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'last_name'
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  company: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  jobTitle: {
    type: DataTypes.STRING(200),
    allowNull: true,
    field: 'job_title'
  },
  status: {
    type: DataTypes.ENUM('new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost'),
    allowNull: false,
    defaultValue: 'new'
  },
  source: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  rating: {
    type: DataTypes.ENUM('hot', 'warm', 'cold'),
    allowNull: true
  },
  score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  estimatedValue: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'estimated_value'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: true,
    defaultValue: 'USD'
  },
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'owner_id'
  },
  convertedContactId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'converted_contact_id'
  },
  convertedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'converted_at'
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
  tableName: 'leads',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['email']
    },
    {
      fields: ['owner_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['rating']
    },
    {
      fields: ['source']
    },
    {
      fields: ['converted_contact_id']
    }
  ]
});

module.exports = Lead;
