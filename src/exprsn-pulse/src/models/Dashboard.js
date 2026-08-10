/**
 * Dashboard Model
 * Container for multiple visualizations arranged in a layout
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Dashboard = sequelize.define('Dashboard', {
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
    layout: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        type: 'grid', // or 'freeform'
        columns: 12,
        rowHeight: 100,
        margin: [10, 10],
        containerPadding: [10, 10]
      },
      comment: 'Layout configuration (grid system, responsive breakpoints, etc.)'
    },
    theme: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        primaryColor: '#007bff',
        backgroundColor: '#ffffff',
        textColor: '#212529',
        fontFamily: 'Arial, sans-serif'
      }
    },
    refreshInterval: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Auto-refresh interval in seconds (null = manual refresh only)'
    },
    isRealtime: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Enable Socket.IO real-time updates'
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    isTemplate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Is this a template for creating new dashboards?'
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Dashboard category (Analytics, Sales, Operations, etc.)'
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: []
    },
    viewCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    lastViewedAt: {
      type: DataTypes.DATE,
      allowNull: true
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
    tableName: 'dashboards',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['is_public'] },
      { fields: ['is_template'] },
      { fields: ['category'] },
      { fields: ['created_by'] },
      { fields: ['created_at'] },
      { fields: ['view_count'] }
    ]
  });

  return Dashboard;
};
