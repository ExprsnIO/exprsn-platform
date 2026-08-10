/**
 * AI Workflow Optimization Model
 *
 * Process improvement suggestions for workflows and processes.
 * Performance, cost, security, maintainability improvements.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AIWorkflowOptimization = sequelize.define('AIWorkflowOptimization', {
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
    workflowType: {
      type: DataTypes.ENUM('lowcode_process', 'exprsn_workflow'),
      allowNull: false,
      field: 'workflow_type',
    },
    workflowId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'workflow_id',
    },
    optimizationType: {
      type: DataTypes.ENUM(
        'performance',
        'cost_reduction',
        'error_handling',
        'parallel_execution',
        'step_consolidation',
        'resource_optimization',
        'security_improvement',
        'maintainability'
      ),
      allowNull: false,
      field: 'optimization_type',
    },
    currentMetrics: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'current_metrics',
      comment: '{ avg_duration_ms: 5000, error_rate: 0.05, cost_per_execution: 0.25 }',
    },
    suggestedChanges: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'suggested_changes',
      comment: 'Modified workflow definition with optimizations',
    },
    projectedImprovements: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'projected_improvements',
      comment: '{ duration_reduction: "40%", error_rate_improvement: "60%", cost_savings: "$100/month" }',
    },
    reasoning: {
      type: DataTypes.TEXT,
      allowNull: false,
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
    testResults: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'test_results',
      comment: 'Results from testing the optimized workflow',
    },
    status: {
      type: DataTypes.ENUM('pending', 'testing', 'approved', 'applied', 'rejected'),
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
    appliedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'applied_at',
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by',
    },
  }, {
    tableName: 'ai_workflow_optimizations',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['workflow_type', 'workflow_id'] },
      { fields: ['status'] },
      { fields: ['optimization_type'] },
    ],
    scopes: {
      pending: {
        where: { status: 'pending' },
        order: [['confidence_score', 'DESC']],
      },
      approved: {
        where: { status: 'approved' },
      },
    },
  });

  AIWorkflowOptimization.associate = (models) => {
    // Belongs to execution log
    AIWorkflowOptimization.belongsTo(models.AIExecutionLog, {
      foreignKey: 'executionLogId',
      as: 'executionLog',
    });
  };

  // Instance methods
  AIWorkflowOptimization.prototype.approve = async function(userId) {
    this.status = 'approved';
    this.reviewedBy = userId;
    this.reviewedAt = new Date();
    await this.save();
  };

  AIWorkflowOptimization.prototype.reject = async function(userId) {
    this.status = 'rejected';
    this.reviewedBy = userId;
    this.reviewedAt = new Date();
    await this.save();
  };

  AIWorkflowOptimization.prototype.markTesting = async function() {
    this.status = 'testing';
    await this.save();
  };

  AIWorkflowOptimization.prototype.recordTestResults = async function(results) {
    this.testResults = results;
    await this.save();
  };

  AIWorkflowOptimization.prototype.apply = async function() {
    this.status = 'applied';
    this.appliedAt = new Date();
    await this.save();
  };

  AIWorkflowOptimization.prototype.calculateImpactScore = function() {
    // Simple scoring algorithm
    let score = 0;

    if (this.projectedImprovements.duration_reduction) {
      const reduction = parseFloat(this.projectedImprovements.duration_reduction);
      score += reduction * 0.3;
    }

    if (this.projectedImprovements.error_rate_improvement) {
      const improvement = parseFloat(this.projectedImprovements.error_rate_improvement);
      score += improvement * 0.4;
    }

    if (this.projectedImprovements.cost_savings) {
      score += 20; // Flat bonus for cost savings
    }

    if (this.confidenceScore) {
      score *= (this.confidenceScore / 100);
    }

    return Math.min(100, score);
  };

  return AIWorkflowOptimization;
};
