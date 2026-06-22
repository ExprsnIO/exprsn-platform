/**
 * ═══════════════════════════════════════════════════════════
 * Agent Execution Model
 * Tracks individual AI agent execution history
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AgentExecution = sequelize.define('AgentExecution', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    agentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'agent_id'
    },
    moderationItemId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'moderation_item_id'
    },
    contentType: {
      type: DataTypes.ENUM(
        'text', 'image', 'video', 'audio',
        'post', 'comment', 'message', 'profile', 'file'
      ),
      allowNull: false,
      field: 'content_type'
    },
    contentId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'content_id'
    },
    sourceService: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'source_service'
    },
    status: {
      type: DataTypes.ENUM('success', 'failure', 'partial', 'skipped'),
      allowNull: false
    },
    executionTimeMs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'execution_time_ms'
    },
    inputData: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'input_data',
      get() {
        const value = this.getDataValue('inputData');
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
    },
    outputData: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'output_data',
      get() {
        const value = this.getDataValue('outputData');
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
    },
    scores: {
      type: DataTypes.JSONB,
      defaultValue: {},
      get() {
        const value = this.getDataValue('scores');
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
    },
    actionTaken: {
      type: DataTypes.ENUM(
        'auto_approve', 'approve', 'reject', 'hide',
        'remove', 'warn', 'flag', 'escalate', 'require_review'
      ),
      allowNull: true,
      field: 'action_taken'
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      get() {
        const value = this.getDataValue('metadata');
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
    },
    executedAt: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'executed_at'
    }
  }, {
    tableName: 'agent_executions',
    underscored: true,
    timestamps: true,
    updatedAt: false
  });

  AgentExecution.associate = (models) => {
    AgentExecution.belongsTo(models.AIAgent, {
      foreignKey: 'agentId',
      as: 'agent'
    });

    AgentExecution.belongsTo(models.ModerationCase, {
      foreignKey: 'moderationItemId',
      as: 'moderationItem'
    });
  };

  return AgentExecution;
};
