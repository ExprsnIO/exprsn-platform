/**
 * FormSubmission Model
 * Represents a submission to a form
 */

module.exports = (sequelize, DataTypes) => {
  const FormSubmission = sequelize.define('FormSubmission', {
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
    submittedBy: {
      type: DataTypes.UUID,
      allowNull: true, // Null if anonymous submission
      field: 'submitted_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    // Submission data (field_key -> value mapping)
    data: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    // File attachments (if form has file fields)
    attachments: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    // Submitter information
    submitterInfo: {
      type: DataTypes.JSONB,
      defaultValue: {
        email: null,
        name: null,
        ipAddress: null,
        userAgent: null
      },
      field: 'submitter_info'
    },
    // Status
    status: {
      type: DataTypes.ENUM('pending', 'reviewed', 'approved', 'rejected', 'spam'),
      defaultValue: 'pending',
      allowNull: false
    },
    // Review notes
    reviewNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'review_notes'
    },
    reviewedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'reviewed_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reviewed_at'
    },
    // Score/rating (if applicable)
    score: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    // Metadata
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'form_submissions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['form_id'] },
      { fields: ['submitted_by'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
      { fields: ['reviewed_by'] }
    ]
  });

  FormSubmission.associate = (models) => {
    FormSubmission.belongsTo(models.Form, {
      foreignKey: 'formId',
      as: 'form'
    });
  };

  return FormSubmission;
};
