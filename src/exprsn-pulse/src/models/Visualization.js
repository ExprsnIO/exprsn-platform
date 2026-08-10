/**
 * Visualization Model
 * Defines chart/visualization configurations
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Visualization = sequelize.define('Visualization', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    datasetId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'datasets',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM(
        // Chart.js charts
        'bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea', 'bubble', 'scatter',
        // D3.js visualizations
        'area', 'stackedArea', 'heatmap', 'treemap', 'sunburst', 'sankey',
        'network', 'chord', 'calendar', 'geographic',
        // Tables and grids
        'table', 'pivot', 'metric', 'gauge'
      ),
      allowNull: false
    },
    renderer: {
      type: DataTypes.ENUM('chartjs', 'd3', 'custom'),
      allowNull: false,
      defaultValue: 'chartjs'
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Visualization configuration (axes, colors, labels, etc.)'
    },
    dataMapping: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Maps dataset columns to visualization properties (x, y, color, size, etc.)'
    },
    filters: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Client-side data filters'
    },
    aggregations: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Data aggregation rules (sum, avg, count, etc.)'
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Preferred width in pixels or grid units'
    },
    height: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Preferred height in pixels or grid units'
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
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
    tableName: 'visualizations',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['dataset_id'] },
      { fields: ['type'] },
      { fields: ['renderer'] },
      { fields: ['created_by'] },
      { fields: ['is_public'] }
    ]
  });

  return Visualization;
};
