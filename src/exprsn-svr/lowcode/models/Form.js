/**
 * Form Model
 *
 * Standalone electronic forms (separate from app_forms).
 * Can exist independently outside of applications.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Form = sequelize.define('Form', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'application_id',
    },
    appFormId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'app_form_id',
    },
    ownerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'owner_id',
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    formDefinition: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'form_definition',
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      allowNull: false,
      defaultValue: 'draft',
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    submissionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'submission_count',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'forms',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['app_form_id'] },
      { fields: ['owner_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  });

  Form.associate = (models) => {
    Form.hasMany(models.FormSubmission, {
      foreignKey: 'formId',
      as: 'submissions',
      onDelete: 'CASCADE',
    });

    Form.hasMany(models.FormDraft, {
      foreignKey: 'formId',
      as: 'drafts',
      onDelete: 'CASCADE',
    });

    Form.hasMany(models.FormCard, {
      foreignKey: 'formId',
      as: 'formCards',
      onDelete: 'CASCADE',
    });

    Form.hasMany(models.FormConnection, {
      foreignKey: 'formId',
      as: 'formConnections',
      onDelete: 'CASCADE',
    });
  };

  return Form;
};
