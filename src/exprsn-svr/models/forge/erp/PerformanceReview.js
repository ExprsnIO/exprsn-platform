const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const PerformanceReview = sequelize.define('PerformanceReview', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  reviewNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'review_number'
  },
  employeeId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'employee_id',
    references: {
      model: 'employees',
      key: 'id'
    }
  },
  reviewerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'reviewer_id',
    comment: 'Usually the manager'
  },
  // Review period
  reviewPeriodStart: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'review_period_start'
  },
  reviewPeriodEnd: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'review_period_end'
  },
  reviewDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'review_date'
  },
  reviewType: {
    type: DataTypes.ENUM('annual', 'mid_year', 'quarterly', 'probation', '90_day', 'project', 'promotion', 'pip', 'other'),
    allowNull: false,
    field: 'review_type'
  },
  // Overall rating
  overallRating: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    field: 'overall_rating',
    comment: '1-5 scale or custom'
  },
  overallRatingLabel: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'overall_rating_label',
    comment: 'Exceeds Expectations, Meets Expectations, etc.'
  },
  // Competency ratings
  competencies: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { name, rating, weight, comments }'
  },
  // Goals evaluation
  previousGoals: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'previous_goals',
    comment: 'Array of { goal, achieved, rating, comments }'
  },
  newGoals: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'new_goals',
    comment: 'Array of { goal, targetDate, metrics, priority }'
  },
  // Strengths and areas for improvement
  strengths: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  areasForImprovement: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'areas_for_improvement'
  },
  developmentPlan: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'development_plan'
  },
  // Manager's comments
  managerComments: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'manager_comments'
  },
  // Employee self-assessment
  selfAssessment: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'self_assessment'
  },
  selfRating: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    field: 'self_rating'
  },
  // Employee feedback
  employeeComments: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'employee_comments'
  },
  employeeAcknowledged: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'employee_acknowledged'
  },
  acknowledgedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'acknowledged_at'
  },
  // Compensation changes
  currentSalary: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'current_salary'
  },
  recommendedSalary: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'recommended_salary'
  },
  salaryIncrease: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'salary_increase'
  },
  salaryIncreasePercent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'salary_increase_percent'
  },
  bonusRecommended: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'bonus_recommended'
  },
  effectiveDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'effective_date',
    comment: 'Effective date for salary changes'
  },
  // Promotion/title change
  currentJobTitle: {
    type: DataTypes.STRING(200),
    allowNull: true,
    field: 'current_job_title'
  },
  recommendedJobTitle: {
    type: DataTypes.STRING(200),
    allowNull: true,
    field: 'recommended_job_title'
  },
  promotionRecommended: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'promotion_recommended'
  },
  // PIP (Performance Improvement Plan)
  isPIP: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_pip',
    comment: 'Is this a Performance Improvement Plan review?'
  },
  pipDuration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'pip_duration',
    comment: 'PIP duration in days'
  },
  pipMilestones: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'pip_milestones',
    comment: 'Array of checkpoints and goals'
  },
  // Status and workflow
  status: {
    type: DataTypes.ENUM('draft', 'self_assessment_pending', 'review_in_progress', 'pending_employee_acknowledgment', 'pending_hr_approval', 'completed', 'cancelled'),
    allowNull: false,
    defaultValue: 'draft'
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'due_date'
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_at'
  },
  // HR approval
  hrApprovedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'hr_approved_by_id'
  },
  hrApprovedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'hr_approved_at'
  },
  hrComments: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'hr_comments'
  },
  // Additional reviewers (360 review)
  peerReviewers: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    field: 'peer_reviewers'
  },
  peerReviews: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'peer_reviews',
    comment: 'Array of { reviewerId, rating, comments }'
  },
  // Workflow integration
  onCompleteWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_complete_workflow_id'
  },
  // Attachments
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { fileName, url, type, uploadedAt }'
  },
  // Metadata
  customFields: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    field: 'custom_fields'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'updated_at'
  }
}, {
  tableName: 'performance_reviews',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['review_number'],
      unique: true
    },
    {
      fields: ['employee_id']
    },
    {
      fields: ['reviewer_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['review_type']
    },
    {
      fields: ['review_period_start', 'review_period_end']
    },
    {
      fields: ['due_date']
    }
  ]
});

module.exports = PerformanceReview;
