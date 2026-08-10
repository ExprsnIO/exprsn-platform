/**
 * ═══════════════════════════════════════════════════════════
 * Git Runner Model
 * Represents CI/CD runners for pipeline execution
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitRunner = sequelize.define('GitRunner', {
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
  runnerType: {
    type: DataTypes.ENUM('docker', 'kubernetes', 'shell', 'ssh', 'digitalocean', 'aws', 'azure', 'gcp'),
    allowNull: false,
    field: 'runner_type'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  configuration: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  maxConcurrentJobs: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'max_concurrent_jobs'
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastContactedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_contacted_at'
  },
  version: {
    type: DataTypes.STRING,
    allowNull: true
  },
  platform: {
    type: DataTypes.STRING,
    allowNull: true
  },
  architecture: {
    type: DataTypes.STRING,
    allowNull: true
  },
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'ip_address'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  }
  }, {
  tableName: 'git_runners',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['runner_type'] },
    { fields: ['active'] },
    { fields: ['tags'], using: 'GIN' }
  ]
  });

  return GitRunner;
};
