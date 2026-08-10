/**
 * AI Execution Log Model
 *
 * Tracks all AI agent executions for debugging, cost tracking, and auditing.
 * Records inputs, outputs, tokens, costs, performance metrics.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AIExecutionLog = sequelize.define('AIExecutionLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    configurationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'configuration_id',
      references: {
        model: 'ai_agent_configurations',
        key: 'id',
      },
    },
    templateId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'template_id',
      references: {
        model: 'ai_agent_templates',
        key: 'id',
      },
    },
    providerName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'provider_name',
    },
    model: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    executionType: {
      type: DataTypes.ENUM(
        'schema_generation',
        'data_validation',
        'data_transformation',
        'workflow_generation',
        'workflow_optimization',
        'decision_evaluation',
        'conversational_query',
        'analysis'
      ),
      allowNull: false,
      field: 'execution_type',
    },
    targetType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'target_type',
    },
    targetId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'target_id',
    },
    inputPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'input_prompt',
    },
    inputContext: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'input_context',
    },
    outputResponse: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'output_response',
    },
    outputStructured: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'output_structured',
    },
    tokensInput: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'tokens_input',
    },
    tokensOutput: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'tokens_output',
    },
    estimatedCost: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: true,
      field: 'estimated_cost',
      comment: 'Cost in USD',
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'duration_ms',
    },
    status: {
      type: DataTypes.ENUM('pending', 'success', 'error', 'timeout', 'rate_limited'),
      allowNull: false,
      defaultValue: 'pending',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
    },
    errorCode: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'error_code',
    },
    retryCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'retry_count',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
    },
    sessionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'session_id',
      comment: 'For grouping related executions (conversation threads, batch operations)',
    },
  }, {
    tableName: 'ai_execution_logs',
    underscored: true,
    timestamps: true,
    updatedAt: false, // Only track creation, not updates
    indexes: [
      { fields: ['configuration_id', 'created_at'] },
      { fields: ['template_id'] },
      { fields: ['execution_type'] },
      { fields: ['status'] },
      { fields: ['user_id'] },
      { fields: ['session_id'] },
      { fields: ['created_at'] }, // For retention cleanup
      { fields: ['provider_name', 'created_at'] }, // Cost tracking per provider
    ],
    scopes: {
      successful: {
        where: { status: 'success' },
      },
      failed: {
        where: { status: ['error', 'timeout', 'rate_limited'] },
      },
      bySession(sessionId) {
        return {
          where: { sessionId },
          order: [['created_at', 'ASC']],
        };
      },
      recent(limit = 100) {
        return {
          order: [['created_at', 'DESC']],
          limit,
        };
      },
      expensive(minCost = 0.01) {
        return {
          where: {
            estimatedCost: {
              [sequelize.Sequelize.Op.gte]: minCost,
            },
          },
          order: [['estimated_cost', 'DESC']],
        };
      },
    },
  });

  AIExecutionLog.associate = (models) => {
    // Belongs to configuration (optional)
    AIExecutionLog.belongsTo(models.AIAgentConfiguration, {
      foreignKey: 'configurationId',
      as: 'configuration',
    });

    // Belongs to template (optional)
    AIExecutionLog.belongsTo(models.AIAgentTemplate, {
      foreignKey: 'templateId',
      as: 'template',
    });

    // Has one schema suggestion
    AIExecutionLog.hasOne(models.AISchemaSuggestion, {
      foreignKey: 'executionLogId',
      as: 'schemaSuggestion',
    });

    // Has one data transformation
    AIExecutionLog.hasOne(models.AIDataTransformation, {
      foreignKey: 'executionLogId',
      as: 'dataTransformation',
    });

    // Has many conversation messages
    AIExecutionLog.hasMany(models.AIConversationMessage, {
      foreignKey: 'executionLogId',
      as: 'conversationMessages',
    });

    // Has one workflow optimization
    AIExecutionLog.hasOne(models.AIWorkflowOptimization, {
      foreignKey: 'executionLogId',
      as: 'workflowOptimization',
    });

    // Has one decision evaluation
    AIExecutionLog.hasOne(models.AIDecisionEvaluation, {
      foreignKey: 'executionLogId',
      as: 'decisionEvaluation',
    });
  };

  // Instance methods
  AIExecutionLog.prototype.getTotalTokens = function() {
    return (this.tokensInput || 0) + (this.tokensOutput || 0);
  };

  AIExecutionLog.prototype.isSuccessful = function() {
    return this.status === 'success';
  };

  AIExecutionLog.prototype.getDurationSeconds = function() {
    if (!this.durationMs) {
      return 0;
    }
    return this.durationMs / 1000;
  };

  AIExecutionLog.prototype.getTokensPerSecond = function() {
    const duration = this.getDurationSeconds();
    if (duration === 0) {
      return 0;
    }
    return this.getTotalTokens() / duration;
  };

  // Static methods
  AIExecutionLog.getTotalCostByPeriod = async function(startDate, endDate) {
    const result = await this.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('estimated_cost')), 'totalCost'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'executionCount'],
        'provider_name',
      ],
      where: {
        createdAt: {
          [sequelize.Sequelize.Op.between]: [startDate, endDate],
        },
        status: 'success',
      },
      group: ['provider_name'],
      raw: true,
    });
    return result;
  };

  AIExecutionLog.getAveragePerformance = async function(executionType, limit = 1000) {
    const result = await this.findOne({
      attributes: [
        [sequelize.fn('AVG', sequelize.col('duration_ms')), 'avgDuration'],
        [sequelize.fn('AVG', sequelize.col('tokens_input')), 'avgInputTokens'],
        [sequelize.fn('AVG', sequelize.col('tokens_output')), 'avgOutputTokens'],
        [sequelize.fn('AVG', sequelize.col('estimated_cost')), 'avgCost'],
      ],
      where: {
        executionType,
        status: 'success',
      },
      limit,
      order: [['created_at', 'DESC']],
      raw: true,
    });
    return result;
  };

  AIExecutionLog.getErrorRate = async function(startDate, endDate) {
    const total = await this.count({
      where: {
        createdAt: {
          [sequelize.Sequelize.Op.between]: [startDate, endDate],
        },
      },
    });

    const errors = await this.count({
      where: {
        createdAt: {
          [sequelize.Sequelize.Op.between]: [startDate, endDate],
        },
        status: ['error', 'timeout', 'rate_limited'],
      },
    });

    return total === 0 ? 0 : (errors / total) * 100;
  };

  return AIExecutionLog;
};
