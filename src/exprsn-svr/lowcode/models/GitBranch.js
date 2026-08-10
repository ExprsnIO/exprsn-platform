/**
 * ═══════════════════════════════════════════════════════════
 * Git Branch Model
 * Represents a Git branch with protection rules
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const GitBranch = sequelize.define('GitBranch', {
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    commitSha: {
      type: DataTypes.STRING(40),
      allowNull: false,
      field: 'commit_sha',
      validate: {
        is: /^[a-f0-9]{40}$/i
      }
    },
    isProtected: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_protected'
    },
    protectionRules: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'protection_rules'
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by'
    }
  }, {
    tableName: 'git_branches',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['repository_id', 'name'], unique: true },
      { fields: ['commit_sha'] }
    ]
  });

  return GitBranch;
};
