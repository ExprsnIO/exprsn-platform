/**
 * Report Model
 * Defines saved reports with queries, parameters, and filters
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Report = sequelize.define('Report', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Report category (Financial, Operations, Marketing, etc.)'
    },
    type: {
      type: DataTypes.ENUM('tabular', 'chart', 'mixed', 'custom'),
      allowNull: false,
      defaultValue: 'mixed'
    },
    definition: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Complete report definition (queries, visualizations, layout)'
    },
    format: {
      type: DataTypes.ENUM('pdf', 'excel', 'csv', 'html', 'json'),
      allowNull: false,
      defaultValue: 'html'
    },
    pageSize: {
      type: DataTypes.ENUM('letter', 'a4', 'legal', 'tabloid'),
      allowNull: true,
      defaultValue: 'letter'
    },
    orientation: {
      type: DataTypes.ENUM('portrait', 'landscape'),
      allowNull: true,
      defaultValue: 'portrait'
    },
    template: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Handlebars template for custom report layouts'
    },
    headerTemplate: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    footerTemplate: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    isTemplate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: []
    },
    executionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    lastExecutedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    avgExecutionTime: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Average execution time in milliseconds'
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'reports',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['category'] },
      { fields: ['type'] },
      { fields: ['is_public'] },
      { fields: ['is_template'] },
      { fields: ['created_by'] },
      { fields: ['execution_count'] }
    ]
  });

  return Report;
};
