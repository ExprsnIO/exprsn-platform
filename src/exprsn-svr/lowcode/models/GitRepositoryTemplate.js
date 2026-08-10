/**
 * ═══════════════════════════════════════════════════════════
 * Git Repository Template Model
 * Represents templates for creating new repositories
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitRepositoryTemplate = sequelize.define('GitRepositoryTemplate', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  language: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['nodejs', 'python', 'ruby', 'java', 'go', 'php', 'csharp', 'react', 'vue', 'angular', 'other']]
    }
  },
  framework: {
    type: DataTypes.STRING,
    allowNull: true
  },
  fileStructure: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'file_structure'
  },
  defaultFiles: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'default_files'
  },
  gitignoreContent: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'gitignore_content'
  },
  readmeTemplate: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'readme_template'
  },
  cicdTemplate: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'cicd_template'
  },
  dockerfileTemplate: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'dockerfile_template'
  },
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_public'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  }
  }, {
  tableName: 'git_repository_templates',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['language'] },
    { fields: ['is_public'] }
  ]
  });

  return GitRepositoryTemplate;
};
