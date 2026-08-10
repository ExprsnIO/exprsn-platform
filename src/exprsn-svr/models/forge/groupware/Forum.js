const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Forum = sequelize.define('Forum', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'category_id'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    icon: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    visibility: {
      type: DataTypes.ENUM('public', 'members_only', 'private'),
      allowNull: false,
      defaultValue: 'public'
    },
    requiresApproval: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'requires_approval'
    },
    allowedRoles: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
      field: 'allowed_roles'
    },
    isModerated: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_moderated'
    },
    moderatorIds: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: true,
      defaultValue: [],
      field: 'moderator_ids'
    },
    threadCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'thread_count'
    },
    postCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'post_count'
    },
    lastPostId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'last_post_id'
    },
    lastPostAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_post_at'
    },
    lastPostUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'last_post_user_id'
    },
    isLocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_locked'
    },
    isArchived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_archived'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'forums',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['category_id'] },
      { fields: ['slug'] },
      { fields: ['visibility'] },
      { fields: ['is_archived'] },
      { fields: ['category_id', 'slug'], unique: true }
    ]
  });

  Forum.associate = (models) => {
    Forum.belongsTo(models.ForumCategory, {
      foreignKey: 'categoryId',
      as: 'Category'
    });

    Forum.hasMany(models.ForumThread, {
      foreignKey: 'forumId',
      as: 'Threads'
    });
  };

  return Forum;
};
