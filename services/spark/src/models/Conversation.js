/**
 * ═══════════════════════════════════════════════════════════
 * Conversation Model
 * Direct messages and group conversations
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Conversation = sequelize.define('Conversation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    type: {
      type: DataTypes.ENUM('direct', 'group'),
      allowNull: false,
      defaultValue: 'direct'
    },

    name: {
      type: DataTypes.STRING,
      allowNull: true // Null for direct messages
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    avatar: {
      type: DataTypes.STRING,
      allowNull: true
    },

    // Creator of the conversation
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false
    },

    // ── Group binding (Phase 4) ────────────────────────────────
    // When set, this conversation is owned by a nexus group. Membership and
    // write authorization for group-bound conversations are resolved LIVE from
    // nexus (see requireGroupMembership / resolveMembership), not from the local
    // Participant rows alone. Null for direct/non-group conversations.
    groupId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'group_id'
    },

    // Distinguishes the two auto-provisioned group channels:
    //   'chat'         — every group member can read + write
    //   'announcement' — every member reads, only admins/owners write
    // Null for non-group conversations.
    channelKind: {
      type: DataTypes.ENUM('chat', 'announcement'),
      allowNull: true,
      field: 'channel_kind'
    },

    // Last message timestamp for sorting
    lastMessageAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },

    // Conversation settings
    settings: {
      type: DataTypes.JSON,
      defaultValue: {
        readReceipts: true,
        typingIndicators: true,
        muteNotifications: false
      }
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    },

    // Status
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'conversations',
    timestamps: true,
    indexes: [
      { fields: ['type'] },
      { fields: ['createdBy'] },
      { fields: ['lastMessageAt'] },
      { fields: ['active'] },
      { fields: ['group_id', 'channel_kind'] }
    ]
  });

  return Conversation;
};
