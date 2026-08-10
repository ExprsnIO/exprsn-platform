/**
 * ═══════════════════════════════════════════════════════════
 * Git Security Service
 * Manages security scanning configuration and results
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');

class GitSecurityService {
  constructor(models) {
    this.GitSecurityScanConfig = models.GitSecurityScanConfig;
    this.GitSecurityScanResult = models.GitSecurityScanResult;
    this.GitRepository = models.GitRepository;
    this.GitAuditLog = models.GitAuditLog;

    // Service URLs
    this.heraldUrl = process.env.HERALD_URL || 'http://localhost:3014';
  }

  // ═══════════════════════════════════════════════════════════
  // Security Scan Configuration
  // ═══════════════════════════════════════════════════════════

  /**
   * Create security scan configuration
   */
  async createScanConfig(repositoryId, scanData, userId) {
    const {
      scanType,
      enabled = true,
      scanOnPush = true,
      scanOnPR = true,
      scanSchedule = null,
      severityThreshold = 'medium',
      failOnVulnerabilities = false,
      excludedPaths = [],
      configuration = {}
    } = scanData;

    // Validate scan type
    const validTypes = ['sast', 'dependency_scanning', 'container_scanning', 'license_compliance'];
    if (!validTypes.includes(scanType)) {
      throw new Error(`Invalid scan type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Validate severity threshold
    const validSeverities = ['critical', 'high', 'medium', 'low'];
    if (!validSeverities.includes(severityThreshold)) {
      throw new Error(`Invalid severity threshold. Must be one of: ${validSeverities.join(', ')}`);
    }

    await this.validateRepository(repositoryId);

    const scanConfig = await this.GitSecurityScanConfig.create({
      repositoryId,
      scanType,
      enabled,
      scanOnPush,
      scanOnPR,
      scanSchedule,
      severityThreshold,
      failOnVulnerabilities,
      excludedPaths,
      configuration,
      createdBy: userId
    });

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'security_scan_config_created',
      entityType: 'security_scan_config',
      entityId: scanConfig.id,
      repositoryId,
      metadata: { scanType, severityThreshold }
    });

    return scanConfig;
  }

  /**
   * Get security scan configurations for repository
   */
  async getScanConfigs(repositoryId) {
    await this.validateRepository(repositoryId);

    return this.GitSecurityScanConfig.findAll({
      where: { repositoryId },
      order: [['scanType', 'ASC']]
    });
  }

  /**
   * Get security scan config by ID
   */
  async getScanConfig(configId) {
    const config = await this.GitSecurityScanConfig.findByPk(configId);

    if (!config) {
      throw new Error('Security scan configuration not found');
    }

    return config;
  }

  /**
   * Update security scan configuration
   */
  async updateScanConfig(configId, updates, userId) {
    const config = await this.getScanConfig(configId);

    await config.update(updates);

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'security_scan_config_updated',
      entityType: 'security_scan_config',
      entityId: configId,
      repositoryId: config.repositoryId,
      metadata: { scanType: config.scanType }
    });

    return config;
  }

  /**
   * Delete security scan configuration
   */
  async deleteScanConfig(configId, userId) {
    const config = await this.getScanConfig(configId);

    await config.destroy();

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'security_scan_config_deleted',
      entityType: 'security_scan_config',
      entityId: configId,
      repositoryId: config.repositoryId,
      metadata: { scanType: config.scanType }
    });

    return { success: true, message: 'Security scan configuration deleted' };
  }

  // ═══════════════════════════════════════════════════════════
  // Security Scan Results
  // ═══════════════════════════════════════════════════════════

  /**
   * Record security scan result
   */
  async recordScanResult(resultData) {
    const {
      configId,
      pipelineRunId = null,
      commitSha,
      status,
      vulnerabilities = {},
      reportUrl = null
    } = resultData;

    // Count vulnerabilities by severity
    const criticalCount = this.countVulnerabilitiesBySeverity(vulnerabilities, 'critical');
    const highCount = this.countVulnerabilitiesBySeverity(vulnerabilities, 'high');
    const mediumCount = this.countVulnerabilitiesBySeverity(vulnerabilities, 'medium');
    const lowCount = this.countVulnerabilitiesBySeverity(vulnerabilities, 'low');

    const result = await this.GitSecurityScanResult.create({
      configId,
      pipelineRunId,
      commitSha,
      status,
      vulnerabilities,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      reportUrl,
      scannedAt: new Date()
    });

    // Send notification if vulnerabilities found
    const config = await this.getScanConfig(configId);
    if (criticalCount > 0 || highCount > 0) {
      await this.sendSecurityAlert(config, result);
    }

    return result;
  }

  /**
   * Get security scan results for config
   */
  async getScanResults(configId, limit = 50) {
    const config = await this.getScanConfig(configId);

    return this.GitSecurityScanResult.findAll({
      where: { configId },
      order: [['scannedAt', 'DESC']],
      limit
    });
  }

  /**
   * Get latest scan result for config
   */
  async getLatestScanResult(configId) {
    const results = await this.getScanResults(configId, 1);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get scan result by ID
   */
  async getScanResult(resultId) {
    const result = await this.GitSecurityScanResult.findByPk(resultId, {
      include: [{
        model: this.GitSecurityScanConfig,
        as: 'config'
      }]
    });

    if (!result) {
      throw new Error('Security scan result not found');
    }

    return result;
  }

  /**
   * Get vulnerability trends for repository
   */
  async getVulnerabilityTrends(repositoryId, days = 30) {
    await this.validateRepository(repositoryId);

    const configs = await this.getScanConfigs(repositoryId);
    const configIds = configs.map(c => c.id);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await this.GitSecurityScanResult.findAll({
      where: {
        configId: configIds,
        scannedAt: {
          [this.GitSecurityScanResult.sequelize.Sequelize.Op.gte]: startDate
        }
      },
      order: [['scannedAt', 'ASC']]
    });

    // Group by date
    const trends = {};
    for (const result of results) {
      const date = result.scannedAt.toISOString().split('T')[0];
      if (!trends[date]) {
        trends[date] = {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0
        };
      }

      trends[date].critical += result.criticalCount;
      trends[date].high += result.highCount;
      trends[date].medium += result.mediumCount;
      trends[date].low += result.lowCount;
    }

    return trends;
  }

  /**
   * Get security score for repository
   */
  async getSecurityScore(repositoryId) {
    await this.validateRepository(repositoryId);

    const configs = await this.getScanConfigs(repositoryId);
    const latestResults = await Promise.all(
      configs.map(config => this.getLatestScanResult(config.id))
    );

    const validResults = latestResults.filter(r => r !== null);

    if (validResults.length === 0) {
      return { score: 100, grade: 'A', message: 'No scans performed yet' };
    }

    // Calculate score (100 - weighted vulnerability count)
    let totalVulnerabilities = 0;
    for (const result of validResults) {
      totalVulnerabilities += result.criticalCount * 10;
      totalVulnerabilities += result.highCount * 5;
      totalVulnerabilities += result.mediumCount * 2;
      totalVulnerabilities += result.lowCount * 1;
    }

    const score = Math.max(0, 100 - totalVulnerabilities);

    // Grade
    let grade = 'F';
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';

    return {
      score,
      grade,
      critical: validResults.reduce((sum, r) => sum + r.criticalCount, 0),
      high: validResults.reduce((sum, r) => sum + r.highCount, 0),
      medium: validResults.reduce((sum, r) => sum + r.mediumCount, 0),
      low: validResults.reduce((sum, r) => sum + r.lowCount, 0)
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Helper Methods
  // ═══════════════════════════════════════════════════════════

  /**
   * Count vulnerabilities by severity
   */
  countVulnerabilitiesBySeverity(vulnerabilities, severity) {
    if (!vulnerabilities || !vulnerabilities.findings) {
      return 0;
    }

    return vulnerabilities.findings.filter(
      v => v.severity?.toLowerCase() === severity
    ).length;
  }

  /**
   * Send security alert notification
   */
  async sendSecurityAlert(config, result) {
    try {
      await axios.post(`${this.heraldUrl}/api/notifications/send`, {
        type: 'security_alert',
        severity: result.criticalCount > 0 ? 'critical' : 'high',
        title: 'Security Vulnerabilities Detected',
        message: `Found ${result.criticalCount} critical and ${result.highCount} high severity vulnerabilities`,
        data: {
          repositoryId: config.repositoryId,
          scanType: config.scanType,
          resultId: result.id,
          commitSha: result.commitSha
        }
      });
    } catch (error) {
      console.error('Failed to send security alert:', error.message);
    }
  }

  /**
   * Validate repository exists
   */
  async validateRepository(repositoryId) {
    const repo = await this.GitRepository.findByPk(repositoryId);
    if (!repo) {
      throw new Error('Repository not found');
    }
    return repo;
  }

  /**
   * Create audit log entry
   */
  async createAuditLog(logData) {
    const {
      userId,
      action,
      entityType,
      entityId,
      repositoryId = null,
      metadata = {}
    } = logData;

    return this.GitAuditLog.create({
      userId,
      action,
      entityType,
      entityId,
      repositoryId,
      metadata,
      timestamp: new Date()
    });
  }
}

module.exports = GitSecurityService;
