/**
 * ═══════════════════════════════════════════════════════════
 * Post Model
 * Timeline posts with media support
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Post = sequelize.define('Post', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false
    },

    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },

    contentType: {
      type: DataTypes.ENUM('text', 'image', 'video', 'link'),
      defaultValue: 'text'
    },

    media: {
      type: DataTypes.JSON,
      defaultValue: []
    },

    visibility: {
      type: DataTypes.ENUM('public', 'followers', 'private'),
      defaultValue: 'public'
    },

    // Owning group (nexus) for group-scoped posts. NULL = personal/global post.
    // Mapped to snake_case column to match the migration; the rest of the model
    // uses camelCase columns (no global `underscored`), so this needs `field`.
    groupId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'group_id',
      comment: 'Owning nexus group for group-scoped posts; NULL = personal/global'
    },

    likeCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },

    commentCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },

    repostCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },

    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    },

    // Bluesky integration fields
    blueskyUri: {
      type: DataTypes.STRING(512),
      allowNull: true,
      comment: 'AT URI of linked Bluesky record (at://did/collection/rkey)'
    },

    blueskyDid: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'DID of Bluesky account that created this post'
    },

    blueskyRkey: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Record key in Bluesky repository'
    },

    syncedToBluesky: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether this post has been synced to Bluesky'
    },

    deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'posts',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['createdAt'] },
      { fields: ['visibility'] },
      { fields: ['deleted'] },
      // Group feed lookup: newest-first within a group.
      { name: 'posts_group_id_created_at', fields: ['group_id', 'createdAt'] },
      { fields: ['blueskyUri'] },
      { fields: ['blueskyDid'] },
      { fields: ['syncedToBluesky'] }
    ]
  });

  return Post;
};
