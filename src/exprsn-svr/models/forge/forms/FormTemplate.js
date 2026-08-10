/**
 * FormTemplate Model
 * Represents a reusable form template
 */

module.exports = (sequelize, DataTypes) => {
  const FormTemplate = sequelize.define('FormTemplate', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    category: {
      type: DataTypes.ENUM(
        'contact',
        'registration',
        'survey',
        'feedback',
        'application',
        'order',
        'booking',
        'quiz',
        'assessment',
        'other'
      ),
      allowNull: false
    },
    // Template definition (form structure)
    template: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        fields: [],
        settings: {},
        submissionSettings: {}
      }
    },
    // Preview image URL
    previewImage: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'preview_image'
    },
    // Is this a system template or user-created?
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      field: 'is_system'
    },
    // Created by (null for system templates)
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    // Usage count
    usageCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      field: 'usage_count'
    },
    // Tags for categorization
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },
    // Metadata
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'form_templates',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['category'] },
      { fields: ['is_system'] },
      { fields: ['created_by'] },
      { fields: ['usage_count'] }
    ]
  });

  FormTemplate.associate = (models) => {
    FormTemplate.hasMany(models.Form, {
      foreignKey: 'templateId',
      as: 'forms'
    });
  };

  return FormTemplate;
};
