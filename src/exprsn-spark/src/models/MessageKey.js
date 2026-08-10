/**
 * ═══════════════════════════════════════════════════════════
 * MessageKey Model
 * Stores encrypted message keys for E2EE recipients
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MessageKey = sequelize.define('MessageKey', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Message this key belongs to
    messageId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'messages',
        key: 'id'
      }
    },

    // Recipient who can decrypt this message
    recipientId: {
      type: DataTypes.UUID,
      allowNull: false
    },

    // AES message key encrypted with recipient's RSA public key
    encryptedMessageKey: {
      type: DataTypes.TEXT,
      allowNull: false
    }
  }, {
    tableName: 'message_keys',
    timestamps: true,
    updatedAt: false, // Only need createdAt
    indexes: [
      { fields: ['messageId'] },
      { fields: ['recipientId'] },
      { fields: ['messageId', 'recipientId'], unique: true }
    ]
  });

  // Associations
  MessageKey.associate = (models) => {
    // Key belongs to a message
    MessageKey.belongsTo(models.Message, {
      foreignKey: 'messageId',
      as: 'message'
    });
  };

  // Class methods
  MessageKey.findByMessageAndRecipient = async function(messageId, recipientId) {
    return await this.findOne({
      where: {
        messageId,
        recipientId
      }
    });
  };

  MessageKey.findByMessage = async function(messageId) {
    return await this.findAll({
      where: { messageId }
    });
  };

  MessageKey.bulkCreateForMessage = async function(messageId, recipientKeys) {
    const records = recipientKeys.map(({ userId, encryptedKey }) => ({
      messageId,
      recipientId: userId,
      encryptedMessageKey: encryptedKey
    }));

    return await this.bulkCreate(records);
  };

  return MessageKey;
};
