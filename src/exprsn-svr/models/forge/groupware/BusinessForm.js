const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BusinessForm = sequelize.define('BusinessForm', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    fields: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    layout: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    onSubmitWorkflowId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'on_submit_workflow_id'
    },
    onApproveWorkflowId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'on_approve_workflow_id'
    },
    onRejectWorkflowId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'on_reject_workflow_id'
    },
    parameters: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    parameterSchema: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      field: 'parameter_schema'
    },
    visibility: {
      type: DataTypes.ENUM('public', 'authenticated', 'role_based', 'private'),
      allowNull: false,
      defaultValue: 'authenticated'
    },
    allowedRoles: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
      field: 'allowed_roles'
    },
    allowedUserIds: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: true,
      defaultValue: [],
      field: 'allowed_user_ids'
    },
    requiresApproval: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'requires_approval'
    },
    approverRole: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'approver_role'
    },
    approverUserIds: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: true,
      defaultValue: [],
      field: 'approver_user_ids'
    },
    autoApprovalRules: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      field: 'auto_approval_rules'
    },
    notifyOnSubmit: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'notify_on_submit'
    },
    notificationRecipients: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: true,
      defaultValue: [],
      field: 'notification_recipients'
    },
    allowMultipleSubmissions: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'allow_multiple_submissions'
    },
    allowDraftSaving: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'allow_draft_saving'
    },
    allowEditingAfterSubmit: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'allow_editing_after_submit'
    },
    successMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'success_message'
    },
    successRedirectUrl: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'success_redirect_url'
    },
    customCss: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'custom_css'
    },
    status: {
      type: DataTypes.ENUM('draft', 'active', 'inactive', 'archived'),
      allowNull: false,
      defaultValue: 'draft'
    },
    isTemplate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_template'
    },
    submissionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'submission_count'
    },
    approvalRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'approval_rate'
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by_id'
    },
    updatedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'updated_by_id'
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'business_forms',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['slug'], unique: true },
      { fields: ['status'] },
      { fields: ['category'] },
      { fields: ['is_template'] },
      { fields: ['created_by_id'] }
    ]
  });

  BusinessForm.associate = (models) => {
    BusinessForm.hasMany(models.FormSubmission, {
      foreignKey: 'formId',
      as: 'Submissions'
    });
  };

  return BusinessForm;
};
