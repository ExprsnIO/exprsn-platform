const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Group extends Model {}

Group.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
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
    unique: true,
    validate: {
      is: /^[a-z0-9-]+$/i
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  creatorId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'creator_id'
  },
  visibility: {
    type: DataTypes.ENUM('public', 'private', 'unlisted'),
    defaultValue: 'public',
    allowNull: false
  },
  joinMode: {
    type: DataTypes.ENUM('open', 'request', 'invite'),
    defaultValue: 'request',
    allowNull: false,
    field: 'join_mode'
  },
  governanceModel: {
    type: DataTypes.ENUM('centralized', 'decentralized', 'dao', 'consensus'),
    defaultValue: 'centralized',
    allowNull: false,
    field: 'governance_model'
  },
  governanceRules: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'governance_rules',
    comment: 'Governance configuration (quorum, voting period, etc.)'
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
    field: 'member_count'
  },
  maxMembers: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'max_members'
  },
  location: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  website: {
    type: DataTypes.STRING(500),
    allowNull: true,
    validate: {
      isUrl: true
    }
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional group metadata'
  },
  isFeatured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_featured'
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_verified'
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
  deletedAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'deleted_at'
  }
}, {
  sequelize,
  modelName: 'Group',
  tableName: 'groups',
  timestamps: false,
  indexes: [
    { fields: ['slug'], unique: true },
    { fields: ['creator_id'] },
    { fields: ['visibility'] },
    { fields: ['category'] },
    { fields: ['is_active'] },
    { fields: ['created_at'] },
    { fields: ['tags'], using: 'gin' }
  ]
});

module.exports = Group;
