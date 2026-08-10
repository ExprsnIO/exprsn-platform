/**
 * ═══════════════════════════════════════════════════════════
 * HTML Project Deployment Model
 * Published versions of HTML projects
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const HtmlProjectDeployment = sequelize.define('HtmlProjectDeployment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'project_id'
  },
  snapshotId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'snapshot_id'
  },
  version: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  environment: {
    type: DataTypes.ENUM('development', 'staging', 'production'),
    allowNull: false,
    defaultValue: 'development'
  },
  url: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Public URL for deployment'
  },
  status: {
    type: DataTypes.ENUM('pending', 'building', 'deployed', 'failed', 'archived'),
    defaultValue: 'pending',
    allowNull: false
  },
  buildLog: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'build_log'
  },
  deployedBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'deployed_by'
  },
  deployedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'deployed_at'
  }
}, {
  tableName: 'html_project_deployments',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['project_id'] },
    { fields: ['environment'] },
    { fields: ['status'] },
    { fields: ['deployed_at'] }
  ]
});

  HtmlProjectDeployment.associate = (models) => {
    HtmlProjectDeployment.belongsTo(models.HtmlProject, {
      foreignKey: 'projectId',
      as: 'project'
    });

    HtmlProjectDeployment.belongsTo(models.HtmlProjectSnapshot, {
      foreignKey: 'snapshotId',
      as: 'snapshot'
    });
  };

  return HtmlProjectDeployment;
};
