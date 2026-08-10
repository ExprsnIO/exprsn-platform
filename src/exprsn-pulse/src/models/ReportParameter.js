/**
 * ReportParameter Model
 * Defines dynamic parameters for reports
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ReportParameter = sequelize.define('ReportParameter', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    reportId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'reports',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
        is: /^[a-zA-Z_][a-zA-Z0-9_]*$/i // Valid identifier
      }
    },
    label: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Human-readable label'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM(
        'string', 'number', 'boolean', 'date', 'datetime',
        'select', 'multiselect', 'user', 'range'
      ),
      allowNull: false
    },
    dataType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'SQL/database data type for query binding'
    },
    defaultValue: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Default parameter value'
    },
    required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    options: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'For select/multiselect: array of {label, value} options'
    },
    optionsQuery: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Dynamic options from query result'
    },
    validation: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Validation rules (min, max, pattern, etc.)'
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    isVisible: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'report_parameters',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['report_id'] },
      { fields: ['report_id', 'order'] },
      { fields: ['name'] }
    ]
  });

  return ReportParameter;
};
