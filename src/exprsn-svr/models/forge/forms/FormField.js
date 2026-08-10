/**
 * FormField Model
 * Represents a field within a form (text, select, file upload, etc.)
 */

module.exports = (sequelize, DataTypes) => {
  const FormField = sequelize.define('FormField', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    formId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'form_id',
      references: {
        model: 'forms',
        key: 'id'
      }
    },
    label: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    fieldType: {
      type: DataTypes.ENUM(
        'text',
        'textarea',
        'email',
        'number',
        'tel',
        'url',
        'date',
        'time',
        'datetime',
        'select',
        'multiselect',
        'radio',
        'checkbox',
        'file',
        'rating',
        'slider',
        'matrix',
        'signature',
        'hidden'
      ),
      allowNull: false,
      field: 'field_type'
    },
    fieldKey: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'field_key',
      validate: {
        is: /^[a-zA-Z0-9_]+$/
      }
    },
    placeholder: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    helpText: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'help_text'
    },
    defaultValue: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'default_value'
    },
    // Field options (for select, radio, checkbox, etc.)
    options: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    // Validation rules
    validation: {
      type: DataTypes.JSONB,
      defaultValue: {
        required: false,
        minLength: null,
        maxLength: null,
        min: null,
        max: null,
        pattern: null,
        customValidation: null
      }
    },
    // Conditional logic
    conditionalLogic: {
      type: DataTypes.JSONB,
      defaultValue: {
        enabled: false,
        rules: []
      },
      field: 'conditional_logic'
    },
    // Display order
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    // Column layout (1-12 for Bootstrap grid)
    columnWidth: {
      type: DataTypes.INTEGER,
      defaultValue: 12,
      field: 'column_width',
      validate: {
        min: 1,
        max: 12
      }
    },
    // Styling
    cssClass: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'css_class'
    },
    // File upload settings (if field_type = 'file')
    fileSettings: {
      type: DataTypes.JSONB,
      defaultValue: {
        allowedTypes: [],
        maxSize: 10485760, // 10MB
        multiple: false
      },
      field: 'file_settings'
    },
    // Metadata
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'form_fields',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['form_id'] },
      { fields: ['form_id', 'field_key'], unique: true },
      { fields: ['order'] }
    ]
  });

  FormField.associate = (models) => {
    FormField.belongsTo(models.Form, {
      foreignKey: 'formId',
      as: 'form'
    });
  };

  return FormField;
};
