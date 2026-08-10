/**
 * Exprsn Herald - Delivery Log Model
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DeliveryLog = sequelize.define('DeliveryLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    notificationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'notifications',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    channel: {
      type: DataTypes.ENUM('push', 'email', 'sms', 'in-app'),
      allowNull: false
    },
    provider: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Provider name (fcm, apns, sendgrid, twilio, etc.)'
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'delivered', 'failed', 'bounced'),
      allowNull: false,
      defaultValue: 'pending'
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Error message if delivery failed'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional metadata (message ID, tracking info, etc.)'
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'delivery_logs',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['notification_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['channel']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  return DeliveryLog;
};
