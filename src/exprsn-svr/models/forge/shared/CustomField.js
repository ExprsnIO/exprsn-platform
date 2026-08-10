const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const CustomField = sequelize.define('CustomField', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  entityType: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'entity_type',
    comment: 'e.g., contact, lead, opportunity, product, invoice'
  },
  fieldName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'field_name'
  },
  label: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  fieldType: {
    type: DataTypes.ENUM('text', 'textarea', 'number', 'date', 'datetime', 'boolean', 'select', 'multiselect', 'url', 'email', 'phone'),
    allowNull: false,
    field: 'field_type'
  },
  options: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'For select/multiselect fields'
  },
  defaultValue: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'default_value'
  },
  required: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  validation: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'JSONLex validation schema'
  },
  position: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
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
  tableName: 'custom_fields',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['entity_type']
    },
    {
      fields: ['field_name']
    },
    {
      fields: ['entity_type', 'field_name'],
      unique: true
    },
    {
      fields: ['is_active']
    }
  ]
});

module.exports = CustomField;
