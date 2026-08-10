const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ForumPost = sequelize.define('ForumPost', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    threadId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'thread_id'
    },
    authorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'author_id'
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    contentFormat: {
      type: DataTypes.ENUM('markdown', 'html', 'bbcode', 'plaintext'),
      allowNull: false,
      defaultValue: 'markdown',
      field: 'content_format'
    },
    parentPostId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'parent_post_id'
    },
    replyToUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'reply_to_user_id'
    },
    editedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'edited_by_id'
    },
    editedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'edited_at'
    },
    editCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'edit_count'
    },
    editReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'edit_reason'
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent'
    },
    likeCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'like_count'
    },
    moderationStatus: {
      type: DataTypes.ENUM('approved', 'pending', 'flagged', 'hidden', 'deleted'),
      allowNull: false,
      defaultValue: 'approved',
      field: 'moderation_status'
    },
    flagCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'flag_count'
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
    isSolution: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_solution'
    },
    markedSolutionAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'marked_solution_at'
    },
    markedSolutionById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'marked_solution_by_id'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'forum_posts',
    timestamps: true,
    paranoid: true,
    underscored: true,
    indexes: [
      { fields: ['thread_id'] },
      { fields: ['author_id'] },
      { fields: ['parent_post_id'] },
      { fields: ['moderation_status'] },
      { fields: ['is_solution'] },
      { fields: ['created_at'] }
    ]
  });

  ForumPost.associate = (models) => {
    ForumPost.belongsTo(models.ForumThread, {
      foreignKey: 'threadId',
      as: 'Thread'
    });

    // Self-referential association for replies
    ForumPost.belongsTo(models.ForumPost, {
      as: 'ParentPost',
      foreignKey: 'parentPostId'
    });

    ForumPost.hasMany(models.ForumPost, {
      as: 'Replies',
      foreignKey: 'parentPostId'
    });
  };

  return ForumPost;
};
