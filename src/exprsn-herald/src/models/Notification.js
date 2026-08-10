/**
 * Exprsn Herald - Notification Model
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Notification = sequelize.define('Notification', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'Recipient user ID'
    },
    type: {
      type: DataTypes.ENUM('info', 'success', 'warning', 'error', 'system'),
      allowNull: false,
      defaultValue: 'info'
    },
    channel: {
      type: DataTypes.ENUM('push', 'email', 'sms', 'in-app'),
      allowNull: false,
      defaultValue: 'in-app'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    data: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'failed', 'read'),
      allowNull: false,
      defaultValue: 'pending'
    },
    priority: {
      type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
      allowNull: false,
      defaultValue: 'normal'
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'notifications',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['channel']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['user_id', 'status']
      }
    ]
  });

  return Notification;
};
