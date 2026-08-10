/**
 * Chart Model - Chart Visualization Definition
 * Stores chart configurations for data visualization
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Chart = sequelize.define('Chart', {
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

    // Chart Configuration (JSON)
    config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Chart configuration including type, styling, data source, etc.'
    },

    // Metadata
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false
    }
  }, {
    tableName: 'charts',
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

  Chart.associate = (models) => {
    Chart.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application'
    });
  };

  return Chart;
};
