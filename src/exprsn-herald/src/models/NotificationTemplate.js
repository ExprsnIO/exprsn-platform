/**
 * Exprsn Herald - Notification Template Model
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const NotificationTemplate = sequelize.define('NotificationTemplate', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    channel: {
      type: DataTypes.ENUM('push', 'email', 'sms', 'in-app'),
      allowNull: false
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Email subject line (for email channel)'
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Template body with {{variable}} placeholders'
    },
    variables: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of available template variables'
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    tableName: 'notification_templates',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['name']
      },
      {
        fields: ['channel']
      },
      {
        fields: ['active']
      }
    ]
  });

  return NotificationTemplate;
};
