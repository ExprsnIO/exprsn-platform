/**
 * ═══════════════════════════════════════════════════════════
 * Email Log Model
 * Track sent emails for audit trail
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EmailLog = sequelize.define('EmailLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    templateId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'template_id'
    },
    recipient: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        isEmail: true
      }
    },
    subject: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('sent', 'failed', 'queued', 'bounced'),
      allowNull: false
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message'
    },
    moderationItemId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'moderation_item_id'
    },
    userActionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_action_id'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      get() {
        const value = this.getDataValue('metadata');
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
    },
    sentAt: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'sent_at'
    }
  }, {
    tableName: 'email_logs',
    underscored: true,
    timestamps: true,
    updatedAt: false
  });

  EmailLog.associate = (models) => {
    EmailLog.belongsTo(models.EmailTemplate, {
      foreignKey: 'templateId',
      as: 'template'
    });

    EmailLog.belongsTo(models.ModerationCase, {
      foreignKey: 'moderationItemId',
      as: 'moderationItem'
    });

    EmailLog.belongsTo(models.UserAction, {
      foreignKey: 'userActionId',
      as: 'userAction'
    });
  };

  return EmailLog;
};
