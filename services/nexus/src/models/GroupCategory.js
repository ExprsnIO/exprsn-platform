const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

/**
 * GroupCategory Model
 *
 * Defines standardized categories for groups with metadata and hierarchical support.
 * Categories help organize groups and power the recommendation engine.
 */
class GroupCategory extends Model {}

GroupCategory.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true,
      len: [2, 100]
    }
  },
  slug: {
    type: DataTypes.STRING(100),
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
  parentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_id',
    references: {
      model: 'group_categories',
      key: 'id'
    },
    onDelete: 'SET NULL',
    comment: 'Parent category for hierarchical categories'
  },
  icon: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Icon identifier or emoji for category'
  },
  color: {
    type: DataTypes.STRING(7),
    allowNull: true,
    validate: {
      is: /^#[0-9A-F]{6}$/i
    },
    comment: 'Hex color for category'
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    comment: 'Display order'
  },
  groupCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'group_count',
    comment: 'Number of groups in this category'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  isFeatured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_featured',
    comment: 'Whether to feature this category'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional category metadata'
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
  }
}, {
  sequelize,
  modelName: 'GroupCategory',
  tableName: 'group_categories',
  timestamps: false,
  indexes: [
    { fields: ['slug'], unique: true },
    { fields: ['parent_id'] },
    { fields: ['is_active'] },
    { fields: ['is_featured'] },
    { fields: ['order'] },
    { fields: ['group_count'] }
  ]
});

module.exports = GroupCategory;
