/**
 * Filter Model
 * Defines reusable filters for reports and dashboards
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Filter = sequelize.define('Filter', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    reportId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'reports',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      comment: 'Report this filter belongs to (null for global filters)'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    field: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Field/column to filter on'
    },
    operator: {
      type: DataTypes.ENUM(
        'equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with',
        'greater_than', 'greater_than_or_equal', 'less_than', 'less_than_or_equal',
        'between', 'not_between', 'in', 'not_in', 'is_null', 'is_not_null',
        'is_empty', 'is_not_empty', 'matches_regex', 'custom'
      ),
      allowNull: false
    },
    value: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Filter value (can be single value, array, or range)'
    },
    caseSensitive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    isGlobal: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Global filters available across all reports'
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'filters',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['report_id'] },
      { fields: ['field'] },
      { fields: ['is_global'] },
      { fields: ['is_active'] },
      { fields: ['created_by'] }
    ]
  });

  return Filter;
};
