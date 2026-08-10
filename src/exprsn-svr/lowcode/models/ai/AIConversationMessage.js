/**
 * AI Conversation Message Model
 *
 * Individual messages within a conversation session.
 * Tracks user inputs, AI responses, and actions taken.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AIConversationMessage = sequelize.define('AIConversationMessage', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    sessionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'session_id',
      references: {
        model: 'ai_conversation_sessions',
        key: 'id',
      },
    },
    executionLogId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'execution_log_id',
      references: {
        model: 'ai_execution_logs',
        key: 'id',
      },
    },
    role: {
      type: DataTypes.ENUM('user', 'assistant', 'system'),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    structuredData: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'structured_data',
      comment: 'Parsed intents, entities, actions from the message',
    },
    actionsTaken: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'actions_taken',
      comment: '[{ type: "create_entity", result: {...} }]',
    },
  }, {
    tableName: 'ai_conversation_messages',
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['session_id', 'created_at'] },
      { fields: ['role'] },
    ],
  });

  AIConversationMessage.associate = (models) => {
    // Belongs to session
    AIConversationMessage.belongsTo(models.AIConversationSession, {
      foreignKey: 'sessionId',
      as: 'session',
    });

    // Belongs to execution log (optional)
    AIConversationMessage.belongsTo(models.AIExecutionLog, {
      foreignKey: 'executionLogId',
      as: 'executionLog',
    });
  };

  // Instance methods
  AIConversationMessage.prototype.isUser = function() {
    return this.role === 'user';
  };

  AIConversationMessage.prototype.isAssistant = function() {
    return this.role === 'assistant';
  };

  AIConversationMessage.prototype.hasActions = function() {
    return this.actionsTaken && this.actionsTaken.length > 0;
  };

  AIConversationMessage.prototype.addAction = async function(type, result) {
    this.actionsTaken.push({ type, result, timestamp: new Date() });
    await this.save();
  };

  return AIConversationMessage;
};
