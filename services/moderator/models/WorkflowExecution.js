/**
 * ═══════════════════════════════════════════════════════════
 * WorkflowExecution Model
 * Durable record of a single workflow run (one row per execution).
 * The workflow definitions themselves live in moderator_config
 * (category 'workflows'); this table records how each run went.
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const WorkflowExecution = sequelize.define('WorkflowExecution', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Which workflow ran (config id — sanitized string, not a DB FK)
    workflowId: {
      type: DataTypes.STRING(255),
      field: 'workflow_id'
    },
    workflowName: {
      type: DataTypes.STRING(255),
      field: 'workflow_name'
    },

    // Lifecycle
    status: {
      type: DataTypes.ENUM('queued', 'running', 'completed', 'failed'),
      allowNull: false,
      defaultValue: 'queued'
    },
    trigger: {
      type: DataTypes.STRING(50)
    },

    // The moderation context the run executed against (after step mutations)
    context: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },

    // Per-step log: [{ type, name?, ok, result?/skipped?/error? }]
    steps: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },

    // Failure detail when status = 'failed'
    error: {
      type: DataTypes.TEXT
    },

    // Epoch-millis timestamps (match the BIGINT style used elsewhere)
    startedAt: {
      type: DataTypes.BIGINT,
      field: 'started_at'
    },
    finishedAt: {
      type: DataTypes.BIGINT,
      field: 'finished_at'
    },

    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at',
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'workflow_executions',
    timestamps: true,
    underscored: true,
    schema: 'moderator',
    indexes: [
      { fields: ['status'] },
      { fields: ['workflow_id'] },
      { fields: ['created_at'] }
    ]
  });

  return WorkflowExecution;
};
