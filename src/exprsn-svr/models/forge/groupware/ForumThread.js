const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ForumThread = sequelize.define('ForumThread', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    forumId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'forum_id'
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    authorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'author_id'
    },
    isPinned: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_pinned'
    },
    isLocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_locked'
    },
    isAnnouncement: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_announcement'
    },
    isSticky: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_sticky'
    },
    viewCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'view_count'
    },
    postCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'post_count'
    },
    replyCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'reply_count'
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
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: []
    },
    moderationStatus: {
      type: DataTypes.ENUM('approved', 'pending', 'flagged', 'hidden', 'deleted'),
      allowNull: false,
      defaultValue: 'approved',
      field: 'moderation_status'
    },
    moderatedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'moderated_by_id'
    },
    moderatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'moderated_at'
    },
    moderationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'moderation_reason'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'forum_threads',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['forum_id'] },
      { fields: ['author_id'] },
      { fields: ['slug'] },
      { fields: ['is_pinned'] },
      { fields: ['is_announcement'] },
      { fields: ['last_post_at'] },
      { fields: ['moderation_status'] }
    ]
  });

  ForumThread.associate = (models) => {
    ForumThread.belongsTo(models.Forum, {
      foreignKey: 'forumId',
      as: 'Forum'
    });

    ForumThread.hasMany(models.ForumPost, {
      foreignKey: 'threadId',
      as: 'Posts'
    });
  };

  return ForumThread;
};
