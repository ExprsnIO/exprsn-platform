const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

/**
 * GroupContentFlag Model
 *
 * Tracks content flagged for moderation review within groups.
 * Content can be posts, comments, events, or any user-generated content in the group.
 */
class GroupContentFlag extends Model {}

GroupContentFlag.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'group_id',
    references: {
      model: 'groups',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  reporterId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'reporter_id',
    comment: 'User who reported the content'
  },
  contentType: {
    type: DataTypes.ENUM('post', 'comment', 'event', 'member', 'message', 'other'),
    allowNull: false,
    field: 'content_type',
    comment: 'Type of content being flagged'
  },
  contentId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'content_id',
    comment: 'ID of the flagged content'
  },
  contentOwnerId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'content_owner_id',
    comment: 'User ID who created the flagged content'
  },
  flagReason: {
    type: DataTypes.ENUM(
      'spam',
      'harassment',
      'hate-speech',
      'violence',
      'misinformation',
      'nsfw',
      'off-topic',
      'inappropriate',
      'copyright',
      'other'
    ),
    allowNull: false,
    field: 'flag_reason'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Additional details about the flag'
  },
  status: {
    type: DataTypes.ENUM('pending', 'under-review', 'resolved', 'dismissed', 'escalated'),
    defaultValue: 'pending',
    allowNull: false
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'medium',
    allowNull: false
  },
  assignedTo: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assigned_to',
    comment: 'Moderator assigned to review this flag'
  },
  moderatorCaseId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'moderator_case_id',
    comment: 'Reference to Moderator service case ID'
  },
  resolution: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Resolution notes from moderator'
  },
  action: {
    type: DataTypes.ENUM(
      'none',
      'warning',
      'content-removed',
      'member-suspended',
      'member-banned',
      'escalated'
    ),
    allowNull: true,
    comment: 'Action taken after review'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional flag metadata (screenshots, evidence, etc.)'
  },
  createdAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'updated_at'
  },
  resolvedAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'resolved_at'
  },
  resolvedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'resolved_by',
    comment: 'Moderator who resolved this flag'
  }
}, {
  sequelize,
  modelName: 'GroupContentFlag',
  tableName: 'group_content_flags',
  timestamps: false,
  indexes: [
    { fields: ['group_id'] },
    { fields: ['reporter_id'] },
    { fields: ['content_type', 'content_id'] },
    { fields: ['content_owner_id'] },
    { fields: ['status'] },
    { fields: ['priority'] },
    { fields: ['assigned_to'] },
    { fields: ['moderator_case_id'] },
    { fields: ['created_at'] },
    { fields: ['flag_reason'] }
  ]
});

module.exports = GroupContentFlag;
