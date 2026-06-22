const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class SubGroup extends Model {}

SubGroup.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  parentGroupId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'parent_group_id',
    references: {
      model: 'groups',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 255]
    }
  },
  slug: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      is: /^[a-z0-9-]+$/i
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  type: {
    type: DataTypes.ENUM('channel', 'subgroup'),
    allowNull: false,
    defaultValue: 'channel',
    comment: 'channel: discussion channel, subgroup: full sub-community'
  },
  creatorId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'creator_id'
  },
  visibility: {
    type: DataTypes.ENUM('public', 'members', 'restricted'),
    defaultValue: 'members',
    allowNull: false,
    comment: 'public: visible to all, members: parent group members, restricted: specific roles'
  },
  inheritPermissions: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'inherit_permissions',
    comment: 'Inherit permissions from parent group'
  },
  permissions: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Custom permissions (overrides if inheritPermissions is false)'
  },
  allowedRoles: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'allowed_roles',
    comment: 'Roles allowed to access (if visibility is restricted)'
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  avatarUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'avatar_url'
  },
  bannerUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'banner_url'
  },
  memberCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    field: 'member_count',
    comment: 'Count of explicit members (if not inheriting from parent)'
  },
  maxMembers: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'max_members'
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'sort_order',
    comment: 'Display order within parent group'
  },
  isPinned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_pinned',
    comment: 'Pinned to top of channel list'
  },
  isArchived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_archived'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional subgroup metadata'
  },
  settings: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Subgroup-specific settings'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
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
  archivedAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'archived_at'
  }
}, {
  sequelize,
  modelName: 'SubGroup',
  tableName: 'subgroups',
  timestamps: false,
  indexes: [
    { fields: ['parent_group_id'] },
    { fields: ['slug'] },
    { fields: ['creator_id'] },
    { fields: ['type'] },
    { fields: ['visibility'] },
    { fields: ['is_active'] },
    { fields: ['sort_order'] },
    { fields: ['parent_group_id', 'slug'], unique: true }
  ]
});

module.exports = SubGroup;
