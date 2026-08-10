/**
 * ═══════════════════════════════════════════════════════════
 * Git Code Owner Model
 * Represents code ownership rules (CODEOWNERS)
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitCodeOwner = sequelize.define('GitCodeOwner', {
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
  pathPattern: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'path_pattern'
  },
  owners: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    defaultValue: []
  },
  teams: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  section: {
    type: DataTypes.STRING,
    allowNull: true
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  }
  }, {
  tableName: 'git_code_owners',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['repository_id'] },
    { fields: ['repository_id', 'order'] }
  ]
  });

  return GitCodeOwner;
};
