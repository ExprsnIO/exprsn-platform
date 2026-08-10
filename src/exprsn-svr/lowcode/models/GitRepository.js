/**
 * ═══════════════════════════════════════════════════════════
 * Git Repository Model
 * Represents a Git repository with Low-Code integration
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitRepository = sequelize.define('GitRepository', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 100]
    }
  },
  slug: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true,
      is: /^[a-z0-9-]+$/i
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  defaultBranch: {
    type: DataTypes.STRING,
    defaultValue: 'main',
    allowNull: false,
    field: 'default_branch'
  },
  visibility: {
    type: DataTypes.ENUM('public', 'private', 'internal'),
    defaultValue: 'private',
    allowNull: false
  },
  // Low-Code integration
  applicationId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'application_id'
  },
  htmlProjectId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'html_project_id'
  },
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'owner_id'
  },
  cloneUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'clone_url'
  },
  sshUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'ssh_url'
  },
  size: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  starsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'stars_count'
  },
  forksCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'forks_count'
  },
  openIssuesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'open_issues_count'
  },
  openPrsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'open_prs_count'
  },
  isFork: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_fork'
  },
  parentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_id'
  },
  archived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  settings: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
  }, {
  tableName: 'git_repositories',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['slug'], unique: true },
    { fields: ['application_id'] },
    { fields: ['html_project_id'] },
    { fields: ['owner_id'] },
    { fields: ['parent_id'] }
  ]
  });

  return GitRepository;
  };
