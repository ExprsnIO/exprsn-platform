/**
 * AI Provider Configuration Model
 *
 * Multi-provider AI integration support.
 * Providers: Anthropic Claude, Ollama (local), OpenAI, custom endpoints
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AIProviderConfig = sequelize.define('AIProviderConfig', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    providerName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      field: 'provider_name',
      validate: {
        notEmpty: true,
      },
    },
    providerType: {
      type: DataTypes.ENUM('anthropic', 'ollama', 'openai', 'custom'),
      allowNull: false,
      field: 'provider_type',
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'display_name',
    },
    baseUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'base_url',
      validate: {
        isUrl: true,
      },
    },
    apiKeyEnvVar: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'api_key_env_var',
      comment: 'Environment variable name for API key (e.g., ANTHROPIC_API_KEY)',
    },
    defaultModel: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'default_model',
    },
    availableModels: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'available_models',
      validate: {
        isValidModels(value) {
          if (!Array.isArray(value)) {
            throw new Error('Available models must be an array');
          }
          for (const model of value) {
            if (!model.id || !model.name) {
              throw new Error('Each model must have id and name');
            }
          }
        },
      },
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Provider-specific configuration (headers, auth method, etc.)',
    },
    rateLimits: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: { rpm: 50, rpd: 10000, tpm: 100000 },
      field: 'rate_limits',
    },
    costConfig: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'cost_config',
      comment: '{ input_token_cost: 0.003, output_token_cost: 0.015 } per 1000 tokens',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_default',
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
      comment: 'Lower number = higher priority for provider selection',
    },
    healthCheckUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'health_check_url',
    },
    lastHealthCheck: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_health_check',
    },
    healthStatus: {
      type: DataTypes.ENUM('healthy', 'degraded', 'unavailable'),
      allowNull: false,
      defaultValue: 'healthy',
      field: 'health_status',
    },
  }, {
    tableName: 'ai_provider_configs',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['provider_type'] },
      { fields: ['is_active', 'is_default'] },
      { fields: ['priority'] },
    ],
    scopes: {
      active: {
        where: { isActive: true },
        order: [['priority', 'ASC']],
      },
      default: {
        where: { isActive: true, isDefault: true },
      },
      healthy: {
        where: { isActive: true, healthStatus: 'healthy' },
        order: [['priority', 'ASC']],
      },
    },
  });

  AIProviderConfig.associate = (models) => {
    // Has many execution logs
    AIProviderConfig.hasMany(models.AIExecutionLog, {
      foreignKey: 'providerName',
      sourceKey: 'providerName',
      as: 'executionLogs',
    });
  };

  // Instance methods
  AIProviderConfig.prototype.getApiKey = function() {
    if (!this.apiKeyEnvVar) {
      return null;
    }
    return process.env[this.apiKeyEnvVar];
  };

  AIProviderConfig.prototype.calculateCost = function(inputTokens, outputTokens) {
    const inputCost = (inputTokens / 1000) * (this.costConfig.input_token_cost || 0);
    const outputCost = (outputTokens / 1000) * (this.costConfig.output_token_cost || 0);
    return inputCost + outputCost;
  };

  AIProviderConfig.prototype.isHealthy = function() {
    return this.isActive && this.healthStatus === 'healthy';
  };

  AIProviderConfig.prototype.getModelById = function(modelId) {
    return this.availableModels.find(m => m.id === modelId);
  };

  // Static methods
  AIProviderConfig.getDefaultProvider = async function() {
    return await this.scope('default').findOne();
  };

  AIProviderConfig.getBestAvailableProvider = async function() {
    return await this.scope('healthy').findOne();
  };

  return AIProviderConfig;
};
