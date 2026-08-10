/**
 * Exprsn Herald - Notification Preference Model
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const NotificationPreference = sequelize.define('NotificationPreference', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User ID'
    },
    channel: {
      type: DataTypes.ENUM('push', 'email', 'sms', 'in-app'),
      allowNull: false
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    notificationType: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Specific notification type (e.g., post_like, new_message)'
    },
    frequency: {
      type: DataTypes.ENUM('realtime', 'digest', 'daily', 'weekly'),
      allowNull: false,
      defaultValue: 'realtime'
    },
    quietHoursStart: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
        max: 23
      },
      comment: 'Quiet hours start (0-23)'
    },
    quietHoursEnd: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
        max: 23
      },
      comment: 'Quiet hours end (0-23)'
    }
  }, {
    tableName: 'notification_preferences',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['channel']
      },
      {
        unique: true,
        fields: ['user_id', 'channel', 'notification_type']
      }
    ]
  });

  return NotificationPreference;
};
