/**
 * DashboardItem Model
 * Links visualizations to dashboards with position and size information
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DashboardItem = sequelize.define('DashboardItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    dashboardId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'dashboards',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    visualizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'visualizations',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    position: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Position in grid: {x, y, w, h, minW, minH, maxW, maxH}'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Override visualization title for this dashboard'
    },
    showTitle: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    showBorder: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    backgroundColor: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Display order within dashboard'
    },
    isLocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Prevent moving/resizing in edit mode'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'dashboard_items',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['dashboard_id'] },
      { fields: ['visualization_id'] },
      { fields: ['dashboard_id', 'order'] }
    ]
  });

  return DashboardItem;
};
