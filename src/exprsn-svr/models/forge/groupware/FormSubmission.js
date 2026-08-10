const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const FormSubmission = sequelize.define('FormSubmission', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    formId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'form_id'
    },
    submittedById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'submitted_by_id'
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    parameters: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    attachments: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    status: {
      type: DataTypes.ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'cancelled'),
      allowNull: false,
      defaultValue: 'draft'
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'submitted_at'
    },
    reviewedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'reviewed_by_id'
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reviewed_at'
    },
    reviewComments: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'review_comments'
    },
    approvalLevel: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'approval_level'
    },
    requiredApprovalLevels: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'required_approval_levels'
    },
    workflowExecutionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'workflow_execution_id'
    },
    workflowStatus: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'workflow_status'
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent'
    },
    lastEditedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_edited_at'
    },
    editCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'edit_count'
    },
    referenceNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      field: 'reference_number'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'form_submissions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['form_id'] },
      { fields: ['submitted_by_id'] },
      { fields: ['status'] },
      { fields: ['submitted_at'] },
      { fields: ['reviewed_by_id'] },
      { fields: ['reference_number'], unique: true },
      { fields: ['workflow_execution_id'] }
    ]
  });

  FormSubmission.associate = (models) => {
    FormSubmission.belongsTo(models.BusinessForm, {
      foreignKey: 'formId',
      as: 'Form'
    });
  };

  return FormSubmission;
};
