const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Comment = sequelize.define('Comment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // Polymorphic association - can comment on any entity
  entityType: {
    type: DataTypes.ENUM('wiki_page', 'document', 'task', 'board_card', 'note'),
    allowNull: false,
    field: 'entity_type',
    comment: 'Type of entity being commented on'
  },
  entityId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'entity_id',
    comment: 'ID of entity being commented on'
  },
  // Comment content
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      len: [1, 5000]
    }
  },
  contentFormat: {
    type: DataTypes.ENUM('plain', 'markdown', 'html'),
    allowNull: false,
    defaultValue: 'markdown',
    field: 'content_format'
  },
  // Authorship
  authorId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'author_id'
  },
  // Threading support
  parentCommentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_comment_id',
    comment: 'For threaded/nested comments'
  },
  depth: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Depth in comment tree (0 = top level)'
  },
  // Edit tracking
  isEdited: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_edited'
  },
  lastEditedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_edited_at'
  },
  editHistory: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    field: 'edit_history',
    comment: 'Array of {content, editedAt} objects'
  },
  // Reactions/engagement
  reactions: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Emoji reactions: {emoji: [userId1, userId2]}'
  },
  reactionCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'reaction_count',
    comment: 'Total count of all reactions'
  },
  // Mentions
  mentions: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    defaultValue: [],
    comment: 'User IDs mentioned in comment (@mentions)'
  },
  // Status
  status: {
    type: DataTypes.ENUM('active', 'deleted', 'hidden', 'flagged'),
    allowNull: false,
    defaultValue: 'active'
  },
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'deleted_at'
  },
  deletedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'deleted_by_id'
  },
  // Moderation
  isFlagged: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_flagged'
  },
  flagReason: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'flag_reason'
  },
  flaggedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'flagged_by_id'
  },
  flaggedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'flagged_at'
  },
  // Attachments
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of attachment objects'
  },
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  // Timestamps
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'updated_at'
  }
}, {
  tableName: 'comments',
  timestamps: true,
  underscored: true,
  paranoid: false, // We handle soft deletes manually with status and deletedAt
  indexes: [
    {
      fields: ['entity_type', 'entity_id'],
      name: 'comments_entity_idx'
    },
    {
      fields: ['author_id']
    },
    {
      fields: ['parent_comment_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['is_flagged']
    }
  ]
});

// Instance methods
Comment.prototype.softDelete = async function(deletedBy) {
  return await this.update({
    status: 'deleted',
    deletedAt: new Date(),
    deletedById: deletedBy
  });
};

Comment.prototype.addReaction = async function(emoji, userId) {
  const reactions = this.reactions || {};
  if (!reactions[emoji]) {
    reactions[emoji] = [];
  }
  if (!reactions[emoji].includes(userId)) {
    reactions[emoji].push(userId);
  }

  const reactionCount = Object.values(reactions).reduce((sum, users) => sum + users.length, 0);

  return await this.update({
    reactions,
    reactionCount
  });
};

Comment.prototype.removeReaction = async function(emoji, userId) {
  const reactions = this.reactions || {};
  if (reactions[emoji]) {
    reactions[emoji] = reactions[emoji].filter(id => id !== userId);
    if (reactions[emoji].length === 0) {
      delete reactions[emoji];
    }
  }

  const reactionCount = Object.values(reactions).reduce((sum, users) => sum + users.length, 0);

  return await this.update({
    reactions,
    reactionCount
  });
};

Comment.prototype.flag = async function(reason, flaggedBy) {
  return await this.update({
    isFlagged: true,
    flagReason: reason,
    flaggedById: flaggedBy,
    flaggedAt: new Date(),
    status: 'flagged'
  });
};

module.exports = Comment;
