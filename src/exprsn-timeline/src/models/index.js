/**
 * ═══════════════════════════════════════════════════════════
 * Database Models
 * Sequelize ORM models for Timeline service
 * ═══════════════════════════════════════════════════════════
 */

const { Sequelize } = require('sequelize');
const config = require('../config');

// Initialize Sequelize
const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: config.database.logging,
    pool: config.database.pool
  }
);

// Import models
const Post = require('./Post')(sequelize);
const Like = require('./Like')(sequelize);
const Follow = require('./Follow')(sequelize);
const Comment = require('./Comment')(sequelize);
const Repost = require('./Repost')(sequelize);
const Bookmark = require('./Bookmark')(sequelize);
const List = require('./List')(sequelize);
const ListMember = require('./ListMember')(sequelize);
const Trending = require('./Trending')(sequelize);
const Attachment = require('./Attachment')(sequelize);

/**
 * ═══════════════════════════════════════════════════════════
 * Model Associations
 * ═══════════════════════════════════════════════════════════
 */

// Post <-> Like (One-to-Many)
Post.hasMany(Like, {
  foreignKey: 'postId',
  as: 'likes'
});

Like.belongsTo(Post, {
  foreignKey: 'postId',
  as: 'post'
});

// Post <-> Comment (One-to-Many)
Post.hasMany(Comment, {
  foreignKey: 'postId',
  as: 'comments'
});

Comment.belongsTo(Post, {
  foreignKey: 'postId',
  as: 'post'
});

// Post <-> Repost (One-to-Many)
Post.hasMany(Repost, {
  foreignKey: 'postId',
  as: 'reposts'
});

Repost.belongsTo(Post, {
  foreignKey: 'postId',
  as: 'post'
});

// Post <-> Bookmark (One-to-Many)
Post.hasMany(Bookmark, {
  foreignKey: 'postId',
  as: 'bookmarks'
});

Bookmark.belongsTo(Post, {
  foreignKey: 'postId',
  as: 'post'
});

// List <-> ListMember (One-to-Many)
List.hasMany(ListMember, {
  foreignKey: 'listId',
  as: 'members'
});

ListMember.belongsTo(List, {
  foreignKey: 'listId',
  as: 'list'
});

// Post <-> Attachment (One-to-Many)
Post.hasMany(Attachment, {
  foreignKey: 'entityId',
  constraints: false,
  scope: {
    entityType: 'post'
  },
  as: 'attachments'
});

// Comment <-> Attachment (One-to-Many)
Comment.hasMany(Attachment, {
  foreignKey: 'entityId',
  constraints: false,
  scope: {
    entityType: 'comment'
  },
  as: 'attachments'
});

module.exports = {
  sequelize,
  Sequelize,
  Post,
  Like,
  Follow,
  Comment,
  Repost,
  Bookmark,
  List,
  ListMember,
  Trending,
  Attachment
};
