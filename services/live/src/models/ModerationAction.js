/**
 * ModerationAction Model
 * Live stream moderation actions and logging
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class ModerationAction extends Model {}

ModerationAction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    stream_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Associated stream (null for event-level actions)',
      references: {
        model: 'streams',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    event_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Associated event',
      references: {
        model: 'events',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    moderator_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Moderator who performed the action (null for automated)'
    },
    target_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'User being moderated (if applicable)'
    },
    action_type: {
      type: DataTypes.ENUM(
        'ban_user',
        'timeout_user',
        'delete_message',
        'block_word',
        'enable_slow_mode',
        'disable_slow_mode',
        'enable_followers_only',
        'disable_followers_only',
        'pin_message',
        'unpin_message',
        'add_moderator',
        'remove_moderator',
        'clear_chat',
        'enable_emote_only',
        'disable_emote_only'
      ),
      allowNull: false
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Reason for the action'
    },
    duration_seconds: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Duration for timeouts/bans (null = permanent)'
    },
    is_automated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether this was an automated action'
    },
    automation_rule: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Which automation rule triggered this (if automated)'
    },
    message_content: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Message content (for delete actions)'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional action metadata'
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the action expires (for temporary bans/timeouts)'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether this action is currently in effect'
    }
  },
  {
    sequelize,
    modelName: 'ModerationAction',
    tableName: 'moderation_actions',
    indexes: [
      { fields: ['stream_id'] },
      { fields: ['event_id'] },
      { fields: ['moderator_id'] },
      { fields: ['target_user_id'] },
      { fields: ['action_type'] },
      { fields: ['is_automated'] },
      { fields: ['is_active'] },
      { fields: ['expires_at'] },
      { fields: ['created_at'] }
    ]
  }
);

module.exports = ModerationAction;
