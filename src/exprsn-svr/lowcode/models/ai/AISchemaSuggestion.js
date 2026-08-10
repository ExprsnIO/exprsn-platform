/**
 * AI Schema Suggestion Model
 *
 * Entity/table/column generation suggestions from AI.
 * Natural language to database schema conversion.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AISchemaSuggestion = sequelize.define('AISchemaSuggestion', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    executionLogId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'execution_log_id',
      references: {
        model: 'ai_execution_logs',
        key: 'id',
      },
    },
    configurationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'configuration_id',
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'application_id',
    },
    entityId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'entity_id',
      comment: 'Existing entity being modified, or null for new entity',
    },
    suggestionType: {
      type: DataTypes.ENUM(
        'new_entity',
        'add_field',
        'modify_field',
        'remove_field',
        'add_relationship',
        'add_index',
        'add_validation',
        'complete_schema'
      ),
      allowNull: false,
      field: 'suggestion_type',
    },
    suggestedSchema: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'suggested_schema',
      comment: 'Complete entity schema or specific changes',
    },
    reasoning: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Why the AI suggested this',
    },
    confidenceScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'confidence_score',
      comment: '0-100',
      validate: {
        min: 0,
        max: 100,
      },
    },
    userPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'user_prompt',
      comment: 'Original natural language request',
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'applied', 'expired'),
      allowNull: false,
      defaultValue: 'pending',
    },
    reviewedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'reviewed_by',
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reviewed_at',
    },
    reviewFeedback: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'review_feedback',
    },
    appliedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'applied_at',
    },
    appliedResult: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'applied_result',
      comment: 'Result of applying the suggestion (entity ID, errors, etc.)',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by',
    },
  }, {
    tableName: 'ai_schema_suggestions',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['entity_id'] },
      { fields: ['status'] },
      { fields: ['created_by'] },
      { fields: ['suggestion_type'] },
    ],
    scopes: {
      pending: {
        where: { status: 'pending' },
        order: [['created_at', 'DESC']],
      },
      approved: {
        where: { status: 'approved' },
      },
      byUser(userId) {
        return { where: { createdBy: userId } };
      },
    },
  });

  AISchemaSuggestion.associate = (models) => {
    // Belongs to execution log
    AISchemaSuggestion.belongsTo(models.AIExecutionLog, {
      foreignKey: 'executionLogId',
      as: 'executionLog',
    });
  };

  // Instance methods
  AISchemaSuggestion.prototype.approve = async function(userId, feedback = null) {
    this.status = 'approved';
    this.reviewedBy = userId;
    this.reviewedAt = new Date();
    this.reviewFeedback = feedback;
    await this.save();
  };

  AISchemaSuggestion.prototype.reject = async function(userId, feedback) {
    this.status = 'rejected';
    this.reviewedBy = userId;
    this.reviewedAt = new Date();
    this.reviewFeedback = feedback;
    await this.save();
  };

  AISchemaSuggestion.prototype.markApplied = async function(result) {
    this.status = 'applied';
    this.appliedAt = new Date();
    this.appliedResult = result;
    await this.save();
  };

  AISchemaSuggestion.prototype.isExpired = function() {
    return this.expiresAt && new Date() > this.expiresAt;
  };

  AISchemaSuggestion.prototype.canApply = function() {
    return this.status === 'approved' && !this.isExpired();
  };

  return AISchemaSuggestion;
};
