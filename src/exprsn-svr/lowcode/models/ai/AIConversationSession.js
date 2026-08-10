/**
 * AI Conversation Session Model
 *
 * Natural language interface sessions.
 * Supports schema design, data queries, workflow building, general assistance.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AIConversationSession = sequelize.define('AIConversationSession', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'application_id',
    },
    sessionType: {
      type: DataTypes.ENUM('schema_design', 'data_query', 'workflow_builder', 'general_assistant'),
      allowNull: false,
      field: 'session_type',
    },
    context: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Current conversation context (entities, forms, workflows referenced)',
    },
    messageCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'message_count',
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_message_at',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'ended_at',
    },
  }, {
    tableName: 'ai_conversation_sessions',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['user_id', 'is_active'] },
      { fields: ['application_id'] },
      { fields: ['session_type'] },
    ],
    scopes: {
      active: {
        where: { isActive: true },
        order: [['last_message_at', 'DESC']],
      },
      byUser(userId) {
        return {
          where: { userId },
          order: [['last_message_at', 'DESC']],
        };
      },
    },
  });

  AIConversationSession.associate = (models) => {
    // Has many messages
    AIConversationSession.hasMany(models.AIConversationMessage, {
      foreignKey: 'sessionId',
      as: 'messages',
    });
  };

  // Instance methods
  AIConversationSession.prototype.addMessage = async function(role, content, structuredData = {}) {
    const { AIConversationMessage } = sequelize.models;

    const message = await AIConversationMessage.create({
      sessionId: this.id,
      role,
      content,
      structuredData,
    });

    this.messageCount += 1;
    this.lastMessageAt = new Date();
    await this.save();

    return message;
  };

  AIConversationSession.prototype.updateContext = async function(newContext) {
    this.context = {
      ...this.context,
      ...newContext,
    };
    await this.save();
  };

  AIConversationSession.prototype.end = async function() {
    this.isActive = false;
    this.endedAt = new Date();
    await this.save();
  };

  AIConversationSession.prototype.getMessages = async function(limit = 50) {
    const { AIConversationMessage } = sequelize.models;
    return await AIConversationMessage.findAll({
      where: { sessionId: this.id },
      order: [['created_at', 'ASC']],
      limit,
    });
  };

  AIConversationSession.prototype.getDuration = function() {
    if (!this.endedAt) {
      return new Date() - this.createdAt;
    }
    return this.endedAt - this.createdAt;
  };

  return AIConversationSession;
};
