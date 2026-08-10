/**
 * Form Model
 * Represents a form with fields, settings, and configuration
 */

module.exports = (sequelize, DataTypes) => {
  const Form = sequelize.define('Form', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    slug: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
      validate: {
        is: /^[a-z0-9-]+$/
      }
    },
    ownerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'owner_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived', 'closed'),
      defaultValue: 'draft',
      allowNull: false
    },
    visibility: {
      type: DataTypes.ENUM('public', 'private', 'organization'),
      defaultValue: 'private',
      allowNull: false
    },
    // Settings
    settings: {
      type: DataTypes.JSONB,
      defaultValue: {
        submitButtonText: 'Submit',
        successMessage: 'Thank you for your submission!',
        requireAuth: false,
        allowMultipleSubmissions: false,
        showProgressBar: true,
        saveProgress: false,
        notifyOnSubmission: true,
        customCss: null
      }
    },
    // Submission settings
    submissionSettings: {
      type: DataTypes.JSONB,
      defaultValue: {
        maxSubmissions: null,
        startDate: null,
        endDate: null,
        limitPerUser: 1,
        requireEmail: false,
        emailVerification: false
      },
      field: 'submission_settings'
    },
    // Notification settings
    notifications: {
      type: DataTypes.JSONB,
      defaultValue: {
        email: [],
        webhook: null,
        slack: null
      }
    },
    // Analytics
    submissionCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      field: 'submission_count'
    },
    viewCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      field: 'view_count'
    },
    // Template source (if created from template)
    templateId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'template_id',
      references: {
        model: 'form_templates',
        key: 'id'
      }
    },
    // Metadata
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'forms',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['owner_id'] },
      { fields: ['slug'], unique: true },
      { fields: ['status'] },
      { fields: ['visibility'] },
      { fields: ['created_at'] },
      { fields: ['template_id'] }
    ]
  });

  Form.associate = (models) => {
    Form.hasMany(models.FormField, {
      foreignKey: 'formId',
      as: 'fields',
      onDelete: 'CASCADE'
    });

    Form.hasMany(models.FormSubmission, {
      foreignKey: 'formId',
      as: 'submissions',
      onDelete: 'CASCADE'
    });

    if (models.FormTemplate) {
      Form.belongsTo(models.FormTemplate, {
        foreignKey: 'templateId',
        as: 'template'
      });
    }
  };

  return Form;
};
