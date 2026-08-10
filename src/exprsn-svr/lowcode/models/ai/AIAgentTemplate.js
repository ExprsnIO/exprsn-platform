/**
 * AI Agent Template Model
 *
 * Defines reusable AI agent personas with specialized prompts and capabilities.
 * Examples: 'schema-architect', 'data-validator', 'workflow-optimizer'
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AIAgentTemplate = sequelize.define('AIAgentTemplate', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        is: /^[a-z0-9-]+$/, // lowercase-with-dashes
      },
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'display_name',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    category: {
      type: DataTypes.ENUM(
        'schema_design',
        'data_transformation',
        'workflow_automation',
        'validation',
        'optimization',
        'conversational',
        'analysis'
      ),
      allowNull: false,
    },
    capabilities: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      validate: {
        isValidCapabilities(value) {
          const validKeys = [
            'schema_generation', 'data_validation', 'data_transformation',
            'workflow_generation', 'workflow_optimization', 'decision_evaluation',
            'conversational_interface', 'code_review', 'analysis'
          ];
          for (const key of Object.keys(value)) {
            if (!validKeys.includes(key)) {
              throw new Error(`Invalid capability: ${key}`);
            }
            if (typeof value[key] !== 'boolean') {
              throw new Error(`Capability ${key} must be boolean`);
            }
          }
        },
      },
    },
    systemPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'system_prompt',
      validate: {
        notEmpty: true,
      },
    },
    defaultModel: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'claude-sonnet-4',
      field: 'default_model',
    },
    temperature: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
      defaultValue: 0.7,
      validate: {
        min: 0.0,
        max: 1.0,
      },
    },
    maxTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 4096,
      field: 'max_tokens',
      validate: {
        min: 1,
        max: 200000,
      },
    },
    responseFormat: {
      type: DataTypes.ENUM('text', 'json', 'structured'),
      allowNull: false,
      defaultValue: 'json',
      field: 'response_format',
    },
    examples: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      validate: {
        isValidExamples(value) {
          if (!Array.isArray(value)) {
            throw new Error('Examples must be an array');
          }
          for (const example of value) {
            if (!example.input || !example.output) {
              throw new Error('Each example must have input and output');
            }
          }
        },
      },
    },
    tools: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    rateLimit: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: { requests_per_minute: 60, requests_per_hour: 1000 },
      field: 'rate_limit',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_system',
      comment: 'System templates cannot be deleted',
    },
    version: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: '1.0.0',
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by',
    },
  }, {
    tableName: 'ai_agent_templates',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['name'] },
      { fields: ['category'] },
      { fields: ['is_active'] },
    ],
    scopes: {
      active: {
        where: { isActive: true },
      },
      byCategory(category) {
        return { where: { category } };
      },
    },
  });

  AIAgentTemplate.associate = (models) => {
    // Has many configurations
    AIAgentTemplate.hasMany(models.AIAgentConfiguration, {
      foreignKey: 'templateId',
      as: 'configurations',
    });

    // Has many execution logs
    AIAgentTemplate.hasMany(models.AIExecutionLog, {
      foreignKey: 'templateId',
      as: 'executionLogs',
    });
  };

  // Instance methods
  AIAgentTemplate.prototype.canPerform = function(capability) {
    return this.capabilities[capability] === true;
  };

  AIAgentTemplate.prototype.buildPrompt = function(customInstructions = '', context = {}) {
    let prompt = this.systemPrompt;

    if (customInstructions) {
      prompt += `\n\nAdditional Instructions:\n${customInstructions}`;
    }

    if (Object.keys(context).length > 0) {
      prompt += `\n\nContext:\n${JSON.stringify(context, null, 2)}`;
    }

    return prompt;
  };

  return AIAgentTemplate;
};
