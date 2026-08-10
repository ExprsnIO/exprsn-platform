/**
 * ═══════════════════════════════════════════════════════════
 * Git Issue Template Model
 * Represents templates for creating new issues
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitIssueTemplate = sequelize.define('GitIssueTemplate', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  repositoryId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'repository_id'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  title: {
    type: DataTypes.STRING,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  templateType: {
    type: DataTypes.ENUM('bug_report', 'feature_request', 'question', 'custom'),
    defaultValue: 'custom',
    field: 'template_type'
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  labels: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  assignees: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: []
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_default'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  }
  }, {
  tableName: 'git_issue_templates',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['repository_id'] },
    { fields: ['template_type'] }
  ]
  });

  return GitIssueTemplate;
};
