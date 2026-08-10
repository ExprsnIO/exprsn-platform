const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Calendar = sequelize.define('Calendar', {
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
  color: {
    type: DataTypes.STRING(7),
    allowNull: true,
    defaultValue: '#3788d8'
  },
  timezone: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: 'UTC'
  },
  isPublic: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_public'
  },
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'owner_id'
  },
  organizationId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'organization_id'
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
  tableName: 'calendars',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['owner_id']
    },
    {
      fields: ['organization_id']
    },
    {
      fields: ['is_public']
    }
  ]
});

module.exports = Calendar;
