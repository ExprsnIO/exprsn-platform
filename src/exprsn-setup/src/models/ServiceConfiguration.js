/**
 * ═══════════════════════════════════════════════════════════════════════
 * ServiceConfiguration Model
 * Stores configuration settings for all Exprsn services
 * ═══════════════════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ServiceConfiguration = sequelize.define('ServiceConfiguration', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Service identification
    serviceId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: 'Service identifier (e.g., ca, auth, timeline)'
    },

    serviceName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Human-readable service name'
    },

    // Service status
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether the service is enabled'
    },

    status: {
      type: DataTypes.ENUM('not_configured', 'configured', 'running', 'stopped', 'error'),
      defaultValue: 'not_configured',
      comment: 'Current service status'
    },

    // Port configuration
    port: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Service port number'
    },

    // Database configuration
    databaseEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether service uses PostgreSQL'
    },

    databaseName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'PostgreSQL database name'
    },

    // Redis configuration
    redisEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether service uses Redis'
    },

    redisPrefix: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Redis key prefix for this service'
    },

    // Configuration sections
    config: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Service-specific configuration (JSON)'
    },

    // Environment variables
    envVars: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Service environment variables'
    },

    // Feature flags
    features: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Feature flags for the service'
    },

    // Health check configuration
    healthCheckUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Health check endpoint URL'
    },

    healthCheckInterval: {
      type: DataTypes.INTEGER,
      defaultValue: 30000,
      comment: 'Health check interval in milliseconds'
    },

    // Dependencies
    dependencies: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      comment: 'List of service dependencies'
    },

    // Metadata
    version: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Service version'
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Service description'
    },

    setupCompleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether initial setup is completed'
    },

    setupSteps: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Setup wizard step completion status'
    },

    // Audit fields
    lastConfiguredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When configuration was last updated'
    },

    lastConfiguredBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'User who last configured this service'
    },

    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional notes about the service'
    }
  }, {
    tableName: 'service_configurations',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['service_id'],
        unique: true
      },
      {
        fields: ['enabled']
      },
      {
        fields: ['status']
      },
      {
        fields: ['setup_completed']
      }
    ]
  });

  // Instance methods
  ServiceConfiguration.prototype.markConfigured = function() {
    this.status = 'configured';
    this.setupCompleted = true;
    this.lastConfiguredAt = new Date();
    return this.save();
  };

  ServiceConfiguration.prototype.updateConfig = function(newConfig, userId = null) {
    this.config = { ...this.config, ...newConfig };
    this.lastConfiguredAt = new Date();
    if (userId) this.lastConfiguredBy = userId;
    return this.save();
  };

  ServiceConfiguration.prototype.enable = function() {
    this.enabled = true;
    return this.save();
  };

  ServiceConfiguration.prototype.disable = function() {
    this.enabled = false;
    this.status = 'stopped';
    return this.save();
  };

  return ServiceConfiguration;
};
