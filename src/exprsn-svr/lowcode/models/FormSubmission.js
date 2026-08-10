/**
 * FormSubmission Model
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const FormSubmission = sequelize.define('FormSubmission', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    formId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'form_id',
    },
    appFormId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'app_form_id',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
    },
    submissionData: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'submission_data',
    },
    attachments: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    status: {
      type: DataTypes.ENUM('submitted', 'processing', 'completed', 'rejected', 'archived'),
      allowNull: false,
      defaultValue: 'submitted',
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address',
    },
    userAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'user_agent',
    },
    validationErrors: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'validation_errors',
    },
    workflowInstanceId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'workflow_instance_id',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'form_submissions',
    timestamps: true,
    underscored: true,
  });

  FormSubmission.associate = (models) => {
    FormSubmission.belongsTo(models.Form, {
      foreignKey: 'formId',
      as: 'form',
    });

    FormSubmission.belongsTo(models.AppForm, {
      foreignKey: 'appFormId',
      as: 'appForm',
    });
  };

  return FormSubmission;
};
