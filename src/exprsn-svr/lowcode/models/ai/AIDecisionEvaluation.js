/**
 * AI Decision Evaluation Model
 *
 * Dynamic decision-making for decision tables.
 * AI can make contextual decisions beyond static rules.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AIDecisionEvaluation = sequelize.define('AIDecisionEvaluation', {
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
    decisionTableId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'decision_table_id',
    },
    inputData: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'input_data',
      comment: 'Input values for the decision',
    },
    aiDecision: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'ai_decision',
      comment: 'AI-generated decision output',
    },
    ruleBasedDecision: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'rule_based_decision',
      comment: 'What the rules would have returned (for comparison)',
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
    reasoning: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Why the AI made this decision',
    },
    factorsConsidered: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'factors_considered',
      comment: '[{ factor: "customer_history", weight: 0.8, value: "..." }]',
    },
    wasCorrect: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: 'was_correct',
      comment: 'Feedback on decision accuracy',
    },
    actualOutcome: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'actual_outcome',
      comment: 'What actually happened (for learning)',
    },
    feedbackProvidedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'feedback_provided_by',
    },
    feedbackProvidedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'feedback_provided_at',
    },
  }, {
    tableName: 'ai_decision_evaluations',
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['decision_table_id', 'created_at'] },
      { fields: ['was_correct'] },
      { fields: ['confidence_score'] },
    ],
    scopes: {
      withFeedback: {
        where: {
          wasCorrect: {
            [sequelize.Sequelize.Op.ne]: null,
          },
        },
      },
      correct: {
        where: { wasCorrect: true },
      },
      incorrect: {
        where: { wasCorrect: false },
      },
      highConfidence(threshold = 80) {
        return {
          where: {
            confidenceScore: {
              [sequelize.Sequelize.Op.gte]: threshold,
            },
          },
        };
      },
    },
  });

  AIDecisionEvaluation.associate = (models) => {
    // Belongs to execution log
    AIDecisionEvaluation.belongsTo(models.AIExecutionLog, {
      foreignKey: 'executionLogId',
      as: 'executionLog',
    });
  };

  // Instance methods
  AIDecisionEvaluation.prototype.provideFeedback = async function(wasCorrect, actualOutcome, userId) {
    this.wasCorrect = wasCorrect;
    this.actualOutcome = actualOutcome;
    this.feedbackProvidedBy = userId;
    this.feedbackProvidedAt = new Date();
    await this.save();
  };

  AIDecisionEvaluation.prototype.agreesWithRules = function() {
    if (!this.ruleBasedDecision) {
      return null; // Unknown
    }
    return JSON.stringify(this.aiDecision) === JSON.stringify(this.ruleBasedDecision);
  };

  AIDecisionEvaluation.prototype.getAccuracyRate = async function() {
    const { AIDecisionEvaluation } = sequelize.models;

    const total = await AIDecisionEvaluation.count({
      where: {
        decisionTableId: this.decisionTableId,
        wasCorrect: {
          [sequelize.Sequelize.Op.ne]: null,
        },
      },
    });

    const correct = await AIDecisionEvaluation.count({
      where: {
        decisionTableId: this.decisionTableId,
        wasCorrect: true,
      },
    });

    return total === 0 ? 0 : (correct / total) * 100;
  };

  return AIDecisionEvaluation;
};
