/**
 * Exprsn Herald - Push Token Model
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PushToken = sequelize.define('PushToken', {
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
    token: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
      comment: 'FCM/APNS device token'
    },
    platform: {
      type: DataTypes.ENUM('ios', 'android', 'web'),
      allowNull: false
    },
    deviceId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Unique device identifier'
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'push_tokens',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['token']
      },
      {
        fields: ['platform']
      },
      {
        fields: ['active']
      }
    ]
  });

  return PushToken;
};
