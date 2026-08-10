const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

/**
 * GroupModerationCase Model
 *
 * Tracks moderation cases within groups. Integrates with the Moderator service
 * for comprehensive moderation workflows and actions.
 */
class GroupModerationCase extends Model {}

GroupModerationCase.init({
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
  caseType: {
    type: DataTypes.ENUM('content-flag', 'member-report', 'automatic', 'admin-review', 'appeal'),
    allowNull: false,
    field: 'case_type',
    comment: 'Type of moderation case'
  },
  subjectType: {
    type: DataTypes.ENUM('member', 'content', 'event', 'group-settings'),
    allowNull: false,
    field: 'subject_type',
    comment: 'What is being moderated'
  },
  subjectId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'subject_id',
    comment: 'ID of the subject being moderated'
  },
  reporterId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'reporter_id',
    comment: 'User who initiated the case (if applicable)'
  },
  moderatorServiceCaseId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'moderator_service_case_id',
    comment: 'Reference to Moderator service case ID'
  },
  severity: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'medium',
    allowNull: false,
    comment: 'Severity of the moderation case'
  },
  status: {
    type: DataTypes.ENUM('open', 'under-review', 'pending-action', 'resolved', 'closed', 'appealed'),
    defaultValue: 'open',
    allowNull: false
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    comment: 'Priority score (higher = more urgent)'
  },
  assignedModerators: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: [],
    field: 'assigned_moderators',
    comment: 'Array of moderator user IDs assigned to this case'
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'Brief description of the case'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Detailed description of the issue'
  },
  evidence: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of evidence (screenshots, links, etc.)'
  },
  flags: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: [],
    comment: 'Array of related GroupContentFlag IDs'
  },
  actions: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of moderation actions taken'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Internal notes for moderators'
  },
  resolution: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Final resolution summary'
  },
  workflow: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Workflow configuration from Moderator service'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional case metadata'
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
  closedAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'closed_at'
  }
}, {
  sequelize,
  modelName: 'GroupModerationCase',
  tableName: 'group_moderation_cases',
  timestamps: false,
  indexes: [
    { fields: ['group_id'] },
    { fields: ['case_type'] },
    { fields: ['subject_type', 'subject_id'] },
    { fields: ['reporter_id'] },
    { fields: ['moderator_service_case_id'] },
    { fields: ['status'] },
    { fields: ['severity'] },
    { fields: ['priority'] },
    { fields: ['assigned_moderators'], using: 'gin' },
    { fields: ['created_at'] },
    { fields: ['updated_at'] }
  ]
});

module.exports = GroupModerationCase;
