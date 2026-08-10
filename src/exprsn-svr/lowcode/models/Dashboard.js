/**
 * Dashboard Model - Dashboard Layout Definition
 * Stores dashboard configurations with widgets
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Dashboard = sequelize.define('Dashboard', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Basic Information
    displayName: {
      type: DataTypes.STRING,
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

    // Foreign Keys
    applicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'applications',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },

    createdBy: {
      type: DataTypes.UUID,
      allowNull: true
    },

    modifiedBy: {
      type: DataTypes.UUID,
      allowNull: true
    },

    // Status
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      defaultValue: 'draft',
      allowNull: false
    },

    // Dashboard Configuration (JSON)
    config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Dashboard configuration including widgets, layout, refresh interval, etc.'
    },

    // Metadata
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false
    }
  }, {
    tableName: 'dashboards',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['application_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['created_by']
      },
      {
        fields: ['created_at']
      },
      {
        using: 'gin',
        fields: ['config']
      }
    ]
  });

  Dashboard.associate = (models) => {
    Dashboard.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application'
    });
  };

  return Dashboard;
};
