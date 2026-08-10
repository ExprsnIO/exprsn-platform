/**
 * ═══════════════════════════════════════════════════════════
 * AI Agent Model
 * Sequelize model for AI moderation agents
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AIAgent = sequelize.define('AIAgent', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        len: [3, 255]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM(
        'text_moderation',
        'image_moderation',
        'video_moderation',
        'spam_detection',
        'rate_limit_detection',
        'hate_speech_detection',
        'nsfw_detection',
        'violence_detection',
        'custom'
      ),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'testing', 'error'),
      allowNull: false,
      defaultValue: 'active'
    },
    provider: {
      type: DataTypes.ENUM('claude', 'openai', 'deepseek', 'local'),
      allowNull: false
    },
    model: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    promptTemplate: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'prompt_template'
    },
    config: {
      type: DataTypes.JSONB,
      defaultValue: {},
      get() {
        const value = this.getDataValue('config');
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
    },
    thresholdScores: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'threshold_scores',
      get() {
        const value = this.getDataValue('thresholdScores');
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
    },
    appliesTo: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
      field: 'applies_to'
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100
      }
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    autoAction: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'auto_action'
    },
    // Performance metrics
    totalExecutions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_executions'
    },
    successfulExecutions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'successful_executions'
    },
    failedExecutions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'failed_executions'
    },
    avgExecutionTimeMs: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'avg_execution_time_ms'
    },
    lastExecutionAt: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'last_execution_at'
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_error'
    },
    lastErrorAt: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'last_error_at'
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by'
    }
  }, {
    tableName: 'ai_agents',
    underscored: true,
    timestamps: true
  });

  AIAgent.associate = (models) => {
    AIAgent.hasMany(models.AgentExecution, {
      foreignKey: 'agentId',
      as: 'executions'
    });
  };

  // Instance methods
  AIAgent.prototype.recordExecution = async function(success, executionTimeMs, error = null) {
    this.totalExecutions += 1;
    if (success) {
      this.successfulExecutions += 1;
    } else {
      this.failedExecutions += 1;
      this.lastError = error;
      this.lastErrorAt = Date.now();
      this.status = 'error';
    }

    // Update average execution time
    const totalTime = (this.avgExecutionTimeMs * (this.totalExecutions - 1)) + executionTimeMs;
    this.avgExecutionTimeMs = Math.round(totalTime / this.totalExecutions);

    this.lastExecutionAt = Date.now();
    await this.save();
  };

  AIAgent.prototype.getSuccessRate = function() {
    if (this.totalExecutions === 0) return 0;
    return (this.successfulExecutions / this.totalExecutions) * 100;
  };

  return AIAgent;
};
