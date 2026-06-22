/**
 * ═══════════════════════════════════════════════════════════
 * Email Template Model
 * Email templates for moderation notifications
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EmailTemplate = sequelize.define('EmailTemplate', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },
    type: {
      type: DataTypes.ENUM(
        'content_approved',
        'content_rejected',
        'content_flagged',
        'content_removed',
        'user_warned',
        'user_suspended',
        'user_banned',
        'appeal_received',
        'appeal_approved',
        'appeal_denied',
        'report_received',
        'report_resolved',
        'review_assigned',
        'custom'
      ),
      allowNull: false
    },
    subject: {
      type: DataTypes.STRING(500),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    bodyText: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'body_text',
      validate: {
        notEmpty: true
      }
    },
    bodyHtml: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'body_html'
    },
    variables: {
      type: DataTypes.JSONB,
      defaultValue: [],
      get() {
        const value = this.getDataValue('variables');
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_default'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      get() {
        const value = this.getDataValue('metadata');
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by'
    }
  }, {
    tableName: 'email_templates',
    underscored: true,
    timestamps: true
  });

  EmailTemplate.associate = (models) => {
    EmailTemplate.hasMany(models.EmailLog, {
      foreignKey: 'templateId',
      as: 'logs'
    });
  };

  // Instance methods
  EmailTemplate.prototype.render = function(data = {}) {
    let subject = this.subject;
    let bodyText = this.bodyText;
    let bodyHtml = this.bodyHtml;

    // Replace variables in template
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, data[key]);
      bodyText = bodyText.replace(regex, data[key]);
      if (bodyHtml) {
        bodyHtml = bodyHtml.replace(regex, data[key]);
      }
    });

    return { subject, bodyText, bodyHtml };
  };

  return EmailTemplate;
};
