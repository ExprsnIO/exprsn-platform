/**
 * ═══════════════════════════════════════════════════════════
 * Database Models
 * Sequelize ORM models for Spark service
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
const Conversation = require('./Conversation')(sequelize);
const Message = require('./Message')(sequelize);
const Participant = require('./Participant')(sequelize);
const Reaction = require('./Reaction')(sequelize);
const Attachment = require('./Attachment')(sequelize);
const EncryptionKey = require('./EncryptionKey')(sequelize);
const MessageKey = require('./MessageKey')(sequelize);

/**
 * ═══════════════════════════════════════════════════════════
 * Model Associations
 * ═══════════════════════════════════════════════════════════
 */

// Conversation <-> Message (One-to-Many)
Conversation.hasMany(Message, {
  foreignKey: 'conversationId',
  as: 'messages'
});

Message.belongsTo(Conversation, {
  foreignKey: 'conversationId',
  as: 'conversation'
});

// Conversation <-> Participant (One-to-Many)
Conversation.hasMany(Participant, {
  foreignKey: 'conversationId',
  as: 'participants'
});

Participant.belongsTo(Conversation, {
  foreignKey: 'conversationId',
  as: 'conversation'
});

// Message <-> Reaction (One-to-Many)
Message.hasMany(Reaction, {
  foreignKey: 'messageId',
  as: 'reactions'
});

Reaction.belongsTo(Message, {
  foreignKey: 'messageId',
  as: 'message'
});

// Message <-> Message (Self-referencing for threads)
Message.hasMany(Message, {
  foreignKey: 'parentMessageId',
  as: 'replies'
});

Message.belongsTo(Message, {
  foreignKey: 'parentMessageId',
  as: 'parentMessage'
});

// Message <-> MessageKey (One-to-Many)
Message.hasMany(MessageKey, {
  foreignKey: 'messageId',
  as: 'encryptionKeys'
});

MessageKey.belongsTo(Message, {
  foreignKey: 'messageId',
  as: 'message'
});

// Message <-> Attachment (One-to-Many)
Message.hasMany(Attachment, {
  foreignKey: 'messageId',
  as: 'attachmentRecords' // Use different alias to avoid conflict with attachments field
});

Attachment.belongsTo(Message, {
  foreignKey: 'messageId',
  as: 'message'
});

module.exports = {
  sequelize,
  Sequelize,
  Conversation,
  Message,
  Participant,
  Reaction,
  Attachment,
  EncryptionKey,
  MessageKey
};
