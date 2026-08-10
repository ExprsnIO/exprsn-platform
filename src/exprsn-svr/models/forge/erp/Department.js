const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Department = sequelize.define('Department', {
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
  // Hierarchy
  parentDepartmentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_department_id'
  },
  // Leadership
  managerId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'manager_id'
  },
  // Budget
  budget: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  // Cost center
  costCenter: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'cost_center'
  },
  // Status
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  // Metadata
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
  tableName: 'departments',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['parent_department_id']
    },
    {
      fields: ['manager_id']
    }
  ]
});

module.exports = Department;
