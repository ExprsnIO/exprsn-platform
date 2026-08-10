/**
 * ═══════════════════════════════════════════════════════════
 * Git Commit Model
 * Represents a Git commit with full metadata
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitCommit = sequelize.define('GitCommit', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  repositoryId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'repository_id'
  },
  sha: {
    type: DataTypes.STRING(40),
    allowNull: false,
    validate: {
      is: /^[a-f0-9]{40}$/i
    }
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  authorName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'author_name'
  },
  authorEmail: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'author_email',
    validate: {
      isEmail: true
    }
  },
  authorId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'author_id'
  },
  committerName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'committer_name'
  },
  committerEmail: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'committer_email',
    validate: {
      isEmail: true
    }
  },
  parentShas: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'parent_shas'
  },
  treeSha: {
    type: DataTypes.STRING(40),
    allowNull: false,
    field: 'tree_sha'
  },
  additions: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  deletions: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  filesChanged: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'files_changed'
  },
  committedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'committed_at'
  }
  }, {
  tableName: 'git_commits',
  underscored: true,
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['repository_id', 'sha'], unique: true },
    { fields: ['author_id'] },
    { fields: ['committed_at'] }
  ]
  });

  return GitCommit;
  };
