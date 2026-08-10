/**
 * ═══════════════════════════════════════════════════════════
 * Git Security Scan Result Model
 * Represents results from security scans
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitSecurityScanResult = sequelize.define('GitSecurityScanResult', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  configId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'config_id'
  },
  pipelineRunId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'pipeline_run_id'
  },
  commitSha: {
    type: DataTypes.STRING(40),
    allowNull: false,
    field: 'commit_sha'
  },
  status: {
    type: DataTypes.ENUM('pending', 'running', 'completed', 'failed'),
    defaultValue: 'pending'
  },
  vulnerabilities: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  criticalCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'critical_count'
  },
  highCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'high_count'
  },
  mediumCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'medium_count'
  },
  lowCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'low_count'
  },
  reportUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'report_url'
  },
  scannedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'scanned_at'
  }
  }, {
  tableName: 'git_security_scan_results',
  underscored: true,
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['config_id'] },
    { fields: ['pipeline_run_id'] },
    { fields: ['commit_sha'] },
    { fields: ['status'] }
  ]
  });

  return GitSecurityScanResult;
};
