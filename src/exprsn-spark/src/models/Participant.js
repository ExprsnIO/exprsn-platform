/**
 * ═══════════════════════════════════════════════════════════
 * Participant Model
 * Conversation participants
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Participant = sequelize.define('Participant', {
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

    userId: {
      type: DataTypes.UUID,
      allowNull: false
    },

    role: {
      type: DataTypes.ENUM('owner', 'admin', 'member'),
      defaultValue: 'member'
    },

    // Last read message ID
    lastReadMessageId: {
      type: DataTypes.UUID,
      allowNull: true
    },

    // Last read timestamp
    lastReadAt: {
      type: DataTypes.DATE,
      allowNull: true
    },

    // Notifications
    muted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    mutedUntil: {
      type: DataTypes.DATE,
      allowNull: true
    },

    // Join/leave tracking
    joinedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },

    leftAt: {
      type: DataTypes.DATE,
      allowNull: true
    },

    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'participants',
    timestamps: true,
    indexes: [
      { fields: ['conversationId'] },
      { fields: ['userId'] },
      { unique: true, fields: ['conversationId', 'userId'] },
      { fields: ['active'] }
    ]
  });

  return Participant;
};
