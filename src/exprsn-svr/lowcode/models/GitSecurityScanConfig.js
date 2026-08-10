/**
 * ═══════════════════════════════════════════════════════════
 * Git Security Scan Config Model
 * Represents security scanning configuration
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitSecurityScanConfig = sequelize.define('GitSecurityScanConfig', {
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
  scanType: {
    type: DataTypes.ENUM('sast', 'dependency_scanning', 'container_scanning', 'license_compliance'),
    allowNull: false,
    field: 'scan_type'
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  scanOnPush: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'scan_on_push'
  },
  scanOnPR: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'scan_on_pr'
  },
  scanSchedule: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'scan_schedule',
    comment: 'Cron expression'
  },
  severityThreshold: {
    type: DataTypes.ENUM('critical', 'high', 'medium', 'low'),
    defaultValue: 'medium',
    field: 'severity_threshold'
  },
  failOnVulnerabilities: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'fail_on_vulnerabilities'
  },
  excludedPaths: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'excluded_paths'
  },
  configuration: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  }
  }, {
  tableName: 'git_security_scan_config',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['repository_id'] },
    { fields: ['scan_type'] },
    { fields: ['enabled'] }
  ]
  });

  return GitSecurityScanConfig;
};
