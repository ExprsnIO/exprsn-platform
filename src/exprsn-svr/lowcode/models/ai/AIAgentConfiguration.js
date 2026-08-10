/**
 * AI Agent Configuration Model
 *
 * Per-entity/form/workflow AI agent customization.
 * Hybrid approach: Global templates + specific overrides.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AIAgentConfiguration = sequelize.define('AIAgentConfiguration', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    templateId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'template_id',
      references: {
        model: 'ai_agent_templates',
        key: 'id',
      },
    },
    targetType: {
      type: DataTypes.ENUM(
        'application',
        'entity',
        'form',
        'grid',
        'workflow',
        'process',
        'decision_table',
        'chart',
        'dashboard'
      ),
      allowNull: false,
      field: 'target_type',
    },
    targetId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'target_id',
      comment: 'ID of the entity/form/workflow/etc.',
    },
    isEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_enabled',
    },
    customPrompt: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'custom_prompt',
      comment: 'Additional instructions specific to this target',
    },
    overrideModel: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'override_model',
    },
    overrideTemperature: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      field: 'override_temperature',
      validate: {
        min: 0.0,
        max: 1.0,
      },
    },
    overrideMaxTokens: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'override_max_tokens',
      validate: {
        min: 1,
        max: 200000,
      },
    },
    triggerEvents: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'trigger_events',
      comment: 'When to invoke: onCreate, onUpdate, onValidate, onDemand, onSchedule',
      validate: {
        isValidEvents(value) {
          if (!Array.isArray(value)) {
            throw new Error('Trigger events must be an array');
          }
          const validEvents = [
            'onCreate', 'onUpdate', 'onDelete', 'onValidate',
            'onSubmit', 'onSave', 'onPublish', 'onExecute',
            'onDemand', 'onSchedule'
          ];
          for (const event of value) {
            if (!validEvents.includes(event)) {
              throw new Error(`Invalid trigger event: ${event}`);
            }
          }
        },
      },
    },
    autoExecute: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'auto_execute',
      comment: 'Execute automatically on triggers without user confirmation',
    },
    requireApproval: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'require_approval',
      comment: 'Require human approval before applying AI suggestions',
    },
    contextData: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'context_data',
      comment: 'Additional context for the agent (schema, business rules, etc.)',
    },
    executionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'execution_count',
    },
    successCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'success_count',
    },
    lastExecutedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_executed_at',
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by',
    },
  }, {
    tableName: 'ai_agent_configurations',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['template_id'] },
      { fields: ['target_type', 'target_id'] },
      { fields: ['is_enabled'] },
      {
        fields: ['target_type', 'target_id', 'template_id'],
        unique: true,
        name: 'unique_agent_per_target',
      },
    ],
    scopes: {
      enabled: {
        where: { isEnabled: true },
      },
      byTarget(targetType, targetId) {
        return { where: { targetType, targetId, isEnabled: true } };
      },
      autoExecutable: {
        where: { isEnabled: true, autoExecute: true },
      },
    },
  });

  AIAgentConfiguration.associate = (models) => {
    // Belongs to template
    AIAgentConfiguration.belongsTo(models.AIAgentTemplate, {
      foreignKey: 'templateId',
      as: 'template',
    });

    // Has many execution logs
    AIAgentConfiguration.hasMany(models.AIExecutionLog, {
      foreignKey: 'configurationId',
      as: 'executionLogs',
    });

    // Has many schema suggestions
    AIAgentConfiguration.hasMany(models.AISchemaSuggestion, {
      foreignKey: 'configurationId',
      as: 'schemaSuggestions',
    });

    // Has many data transformations
    AIAgentConfiguration.hasMany(models.AIDataTransformation, {
      foreignKey: 'configurationId',
      as: 'dataTransformations',
    });
  };

  // Instance methods
  AIAgentConfiguration.prototype.shouldTriggerOn = function(event) {
    return this.isEnabled && this.triggerEvents.includes(event);
  };

  AIAgentConfiguration.prototype.getEffectiveModel = async function() {
    if (this.overrideModel) {
      return this.overrideModel;
    }
    await this.reload({ include: ['template'] });
    return this.template.defaultModel;
  };

  AIAgentConfiguration.prototype.getEffectiveTemperature = async function() {
    if (this.overrideTemperature !== null) {
      return this.overrideTemperature;
    }
    await this.reload({ include: ['template'] });
    return this.template.temperature;
  };

  AIAgentConfiguration.prototype.getEffectiveMaxTokens = async function() {
    if (this.overrideMaxTokens !== null) {
      return this.overrideMaxTokens;
    }
    await this.reload({ include: ['template'] });
    return this.template.maxTokens;
  };

  AIAgentConfiguration.prototype.buildFullPrompt = async function(additionalContext = {}) {
    await this.reload({ include: ['template'] });

    const mergedContext = {
      ...this.contextData,
      ...additionalContext,
    };

    return this.template.buildPrompt(this.customPrompt || '', mergedContext);
  };

  AIAgentConfiguration.prototype.recordExecution = async function(success = true) {
    this.executionCount += 1;
    if (success) {
      this.successCount += 1;
    }
    this.lastExecutedAt = new Date();
    await this.save();
  };

  AIAgentConfiguration.prototype.getSuccessRate = function() {
    if (this.executionCount === 0) {
      return 0;
    }
    return (this.successCount / this.executionCount) * 100;
  };

  return AIAgentConfiguration;
};
