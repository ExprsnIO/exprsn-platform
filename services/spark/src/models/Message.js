/**
 * ═══════════════════════════════════════════════════════════
 * Message Model
 * Chat messages with rich media support
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Message = sequelize.define('Message', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    conversationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'conversations',
        key: 'id'
      }
    },

    senderId: {
      type: DataTypes.UUID,
      allowNull: false
    },

    content: {
      type: DataTypes.TEXT,
      allowNull: true // Null for encrypted messages
    },

    contentType: {
      type: DataTypes.ENUM('text', 'image', 'video', 'file', 'audio'),
      defaultValue: 'text'
    },

    // End-to-End Encryption fields
    encrypted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    encryptedContent: {
      type: DataTypes.TEXT,
      allowNull: true // Stores encrypted message content
    },

    senderKeyFingerprint: {
      type: DataTypes.STRING(64),
      allowNull: true // Sender's key fingerprint for verification
    },

    // For threaded conversations
    parentMessageId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'messages',
        key: 'id'
      }
    },

    // Attachments
    attachments: {
      type: DataTypes.JSON,
      defaultValue: []
    },

    // Mentions
    mentions: {
      type: DataTypes.JSON,
      defaultValue: []
    },

    // Edited flag
    edited: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    editedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },

    // Deleted flag (soft delete)
    deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },

    // Read receipts (user IDs who have read this message)
    readBy: {
      type: DataTypes.JSON,
      defaultValue: []
    },

    // Delivered receipts
    deliveredTo: {
      type: DataTypes.JSON,
      defaultValue: []
    },

    // Message forwarding
    forwardedFrom: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'messages',
        key: 'id'
      }
    },

    // Pinned message
    isPinned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    pinnedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },

    pinnedBy: {
      type: DataTypes.UUID,
      allowNull: true
    },

    // Threading
    threadId: {
      type: DataTypes.UUID,
      allowNull: true
    },

    replyCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'messages',
    timestamps: true,
    indexes: [
      { fields: ['conversationId'] },
      { fields: ['senderId'] },
      { fields: ['parentMessageId'] },
      { fields: ['threadId'] },
      { fields: ['forwardedFrom'] },
      { fields: ['isPinned'] },
      { fields: ['createdAt'] },
      { fields: ['deleted'] },
      { fields: ['encrypted'] },
      { fields: ['senderKeyFingerprint'] }
    ],
    hooks: {
      beforeValidate(message) {
        // Ensure either content or encryptedContent is present
        if (message.encrypted) {
          if (!message.encryptedContent) {
            throw new Error('Encrypted messages must have encryptedContent');
          }
          if (!message.senderKeyFingerprint) {
            throw new Error('Encrypted messages must have senderKeyFingerprint');
          }
          // Clear plaintext content for encrypted messages
          message.content = null;
        } else {
          if (!message.content) {
            throw new Error('Non-encrypted messages must have content');
          }
        }
      }
    }
  });

  return Message;
};
