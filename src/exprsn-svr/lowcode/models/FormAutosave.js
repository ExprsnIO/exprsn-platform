/**
 * FormAutosave Model
 *
 * Stores autosave data for forms as a fallback when Redis/Socket.IO is unavailable.
 */

const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class FormAutosave extends Model {
    /**
     * Helper method to get formatted autosave data
     */
    toJSON() {
      return {
        id: this.id,
        formId: this.formId,
        formName: this.formName,
        schema: this.schema,
        components: this.components,
        customFunctions: this.customFunctions,
        variables: this.variables,
        timestamp: this.timestamp,
        version: this.version,
        userId: this.userId,
        savedAt: this.savedAt,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
      };
    }
  }

  FormAutosave.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      formId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        field: 'form_id',
        comment: 'Reference to the form being autosaved'
      },
      formName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: 'Untitled Form',
        field: 'form_name'
      },
      schema: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
        get() {
          const rawValue = this.getDataValue('schema');
          return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        }
      },
      components: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        get() {
          const rawValue = this.getDataValue('components');
          return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        }
      },
      customFunctions: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
        field: 'custom_functions',
        get() {
          const rawValue = this.getDataValue('customFunctions');
          return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        }
      },
      variables: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        get() {
          const rawValue = this.getDataValue('variables');
          return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        }
      },
      timestamp: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: 'Client-side timestamp when autosave was triggered'
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      userId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'user_id',
        comment: 'User who triggered the autosave'
      },
      savedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'saved_at',
        comment: 'Server-side timestamp when autosave was saved'
      }
    },
    {
      sequelize,
      modelName: 'FormAutosave',
      tableName: 'form_autosaves',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['form_id']
        },
        {
          fields: ['user_id']
        },
        {
          fields: ['saved_at']
        }
      ]
    }
  );

  return FormAutosave;
};
