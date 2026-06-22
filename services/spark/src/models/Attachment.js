/**
 * ═══════════════════════════════════════════════════════════
 * Attachment Model
 * File attachments for messages
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Attachment = sequelize.define('Attachment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    messageId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'messages',
        key: 'id'
      }
    },

    fileName: {
      type: DataTypes.STRING,
      allowNull: false
    },

    originalName: {
      type: DataTypes.STRING,
      allowNull: false
    },

    mimeType: {
      type: DataTypes.STRING,
      allowNull: false
    },

    fileSize: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    fileUrl: {
      type: DataTypes.STRING,
      allowNull: false
    },

    thumbnailUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },

    // For media files
    duration: {
      type: DataTypes.INTEGER, // In seconds
      allowNull: true
    },

    dimensions: {
      type: DataTypes.JSON,
      defaultValue: {}, // { width, height }
      allowNull: true
    },

    // Security
    encrypted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    // Processing status
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'ready', 'failed'),
      defaultValue: 'pending'
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'attachments',
    timestamps: true,
    indexes: [
      { fields: ['messageId'] },
      { fields: ['status'] },
      { fields: ['createdAt'] }
    ]
  });

  return Attachment;
};
