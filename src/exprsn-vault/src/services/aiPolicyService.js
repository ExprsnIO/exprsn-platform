/**
 * AI Policy Service
 * AI-powered policy suggestions and anomaly detection
 */

const { AccessPolicy, VaultToken, AuditLog } = require('../models');
const { logger } = require('@exprsn/shared');
const { Sequelize } = require('sequelize');

class AIPolicyService {
  /**
   * Analyze access patterns and suggest policies
   * @param {string} entityType - Entity type to analyze
   * @param {string} entityId - Entity ID to analyze
   * @returns {Array} Suggested policies
   */
  async suggestPolicies(entityType, entityId) {
    try {
      // Analyze historical access patterns
      const patterns = await this._analyzeAccessPatterns(entityType, entityId);

      // Generate policy suggestions based on patterns
      const suggestions = [];

      // Suggest time-based restrictions if access is clustered
      if (patterns.timeCluster) {
        suggestions.push({
          name: `Time-based access for ${entityId}`,
          description: 'Access restricted to business hours based on usage patterns',
          policyType: 'global',
          rules: {
            timeRestriction: {
              timezone: 'UTC',
              allowedHours: patterns.timeCluster.hours,
              allowedDays: patterns.timeCluster.days
            }
          },
          aiSuggested: true,
          aiConfidence: patterns.timeCluster.confidence,
          priority: 90
        });
      }

      // Suggest path-based restrictions
      if (patterns.commonPaths && patterns.commonPaths.length > 0) {
        suggestions.push({
          name: `Path-based access for ${entityId}`,
          description: 'Access limited to frequently used paths',
          policyType: 'secret',
          rules: {
            pathRestrictions: patterns.commonPaths.map(p => p.path)
          },
          aiSuggested: true,
          aiConfidence: 0.8,
          priority: 85
        });
      }

      // Suggest IP whitelisting if access from consistent IPs
      if (patterns.consistentIPs && patterns.consistentIPs.length > 0) {
        suggestions.push({
          name: `IP whitelist for ${entityId}`,
          description: 'Restrict access to known IP addresses',
          policyType: 'global',
          rules: {
            ipWhitelist: patterns.consistentIPs
          },
          aiSuggested: true,
          aiConfidence: 0.85,
          priority: 95
        });
      }

      // Suggest rate limiting based on usage
      if (patterns.avgRequestsPerHour > 10) {
        suggestions.push({
          name: `Rate limiting for ${entityId}`,
          description: 'Prevent abuse with rate limiting',
          policyType: 'global',
          rules: {
            rateLimit: {
              maxRequests: Math.ceil(patterns.avgRequestsPerHour * 1.5),
              windowMinutes: 60
            }
          },
          aiSuggested: true,
          aiConfidence: 0.9,
          priority: 100
        });
      }

      logger.info('Generated AI policy suggestions', {
        entityType,
        entityId,
        count: suggestions.length
      });

      return suggestions;
    } catch (error) {
      logger.error('Failed to suggest policies', { error: error.message });
      return [];
    }
  }

  /**
   * Detect anomalous token usage
   * @param {string} tokenId - Token to analyze
   * @returns {Object} Anomaly detection result
   */
  async detectAnomalies(tokenId) {
    try {
      const token = await VaultToken.findOne({ where: { tokenId } });
      if (!token) {
        throw new Error('Token not found');
      }

      // Analyze recent audit logs for this token
      const recentLogs = await AuditLog.findAll({
        where: {
          resourceType: 'vault_token',
          resourceId: token.id,
          createdAt: {
            [Sequelize.Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          }
        },
        order: [['createdAt', 'DESC']]
      });

      const anomalies = [];

      // Check for unusual access times
      const accessTimes = recentLogs.map(log => new Date(log.createdAt).getHours());
      const unusualTimes = this._detectUnusualTimes(accessTimes);
      if (unusualTimes.length > 0) {
        anomalies.push({
          type: 'unusual_access_time',
          severity: 'medium',
          description: `Access detected at unusual hours: ${unusualTimes.join(', ')}`,
          confidence: 0.75
        });
      }

      // Check for rapid succession requests (potential abuse)
      const rapidRequests = this._detectRapidRequests(recentLogs);
      if (rapidRequests) {
        anomalies.push({
          type: 'rapid_requests',
          severity: 'high',
          description: `${rapidRequests.count} requests in ${rapidRequests.seconds} seconds`,
          confidence: 0.9
        });
      }

      // Check for access from new IPs
      const newIPs = await this._detectNewIPs(token, recentLogs);
      if (newIPs.length > 0) {
        anomalies.push({
          type: 'new_ip_address',
          severity: 'medium',
          description: `Access from ${newIPs.length} new IP(s): ${newIPs.join(', ')}`,
          confidence: 0.8
        });
      }

      // Check for permission escalation attempts
      const escalation = this._detectPermissionEscalation(recentLogs);
      if (escalation) {
        anomalies.push({
          type: 'permission_escalation',
          severity: 'critical',
          description: 'Attempted access to resources beyond granted permissions',
          confidence: 0.95
        });
      }

      // Update token risk score
      if (anomalies.length > 0) {
        const avgSeverity = this._calculateAverageSeverity(anomalies);
        await token.update({
          riskScore: Math.min(1, token.riskScore + avgSeverity * 0.2)
        });
      }

      return {
        tokenId,
        anomalies,
        riskScore: token.riskScore,
        recommendation: this._generateRecommendation(anomalies)
      };
    } catch (error) {
      logger.error('Anomaly detection failed', { error: error.message, tokenId });
      return { tokenId, anomalies: [], error: error.message };
    }
  }

  /**
   * Generate access report with AI insights
   * @param {Object} filters - Report filters
   * @returns {Object} Access report
   */
  async generateAccessReport(filters = {}) {
    try {
      const { startDate, endDate, entityType, entityId } = filters;

      const where = {
        action: { [Sequelize.Op.like]: 'token_%' }
      };

      if (startDate) {
        where.createdAt = { [Sequelize.Op.gte]: startDate };
      }
      if (endDate) {
        where.createdAt = { ...where.createdAt, [Sequelize.Op.lte]: endDate };
      }

      const logs = await AuditLog.findAll({ where, order: [['createdAt', 'DESC']] });

      // AI-powered insights
      const insights = {
        totalAccess: logs.length,
        successRate: (logs.filter(l => l.success).length / logs.length) * 100,
        topActions: this._getTopActions(logs),
        peakHours: this._getPeakHours(logs),
        riskDistribution: await this._getRiskDistribution(),
        trends: this._analyzeTrends(logs)
      };

      return {
        period: { startDate, endDate },
        insights,
        logs: logs.slice(0, 100), // Return latest 100
        totalCount: logs.length
      };
    } catch (error) {
      logger.error('Failed to generate access report', { error: error.message });
      throw error;
    }
  }

  // Private helper methods

  async _analyzeAccessPatterns(entityType, entityId) {
    const logs = await AuditLog.findAll({
      where: {
        actor: entityId,
        createdAt: {
          [Sequelize.Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      },
      order: [['createdAt', 'DESC']]
    });

    const patterns = {
      totalAccess: logs.length,
      avgRequestsPerHour: logs.length / (30 * 24),
      commonPaths: this._extractCommonPaths(logs),
      consistentIPs: this._extractConsistentIPs(logs),
      timeCluster: this._detectTimeCluster(logs)
    };

    return patterns;
  }

  _extractCommonPaths(logs) {
    const pathCounts = {};

    logs.forEach(log => {
      const path = log.metadata?.path || log.resourcePath;
      if (path) {
        pathCounts[path] = (pathCounts[path] || 0) + 1;
      }
    });

    return Object.entries(pathCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([path, count]) => ({ path, count }));
  }

  _extractConsistentIPs(logs) {
    const ipCounts = {};

    logs.forEach(log => {
      const ip = log.metadata?.ip;
      if (ip) {
        ipCounts[ip] = (ipCounts[ip] || 0) + 1;
      }
    });

    // Return IPs used in >80% of requests
    const threshold = logs.length * 0.8;
    return Object.entries(ipCounts)
      .filter(([_, count]) => count >= threshold)
      .map(([ip]) => ip);
  }

  _detectTimeCluster(logs) {
    const hourCounts = Array(24).fill(0);
    const dayCounts = Array(7).fill(0);

    logs.forEach(log => {
      const date = new Date(log.createdAt);
      hourCounts[date.getHours()]++;
      dayCounts[date.getDay()]++;
    });

    // Find hours with >80% of activity
    const totalRequests = logs.length;
    const activeHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter(h => h.count > totalRequests * 0.05)
      .map(h => h.hour);

    const activeDays = dayCounts
      .map((count, day) => ({ day, count }))
      .filter(d => d.count > totalRequests * 0.1)
      .map(d => d.day);

    if (activeHours.length < 12 || activeDays.length < 7) {
      return {
        hours: activeHours,
        days: activeDays,
        confidence: 0.85
      };
    }

    return null;
  }

  _detectUnusualTimes(accessTimes) {
    // Detect access outside normal business hours (9am-5pm)
    return accessTimes.filter(hour => hour < 9 || hour > 17);
  }

  _detectRapidRequests(logs) {
    if (logs.length < 2) return null;

    for (let i = 0; i < logs.length - 1; i++) {
      const current = new Date(logs[i].createdAt);
      const next = new Date(logs[i + 1].createdAt);
      const diff = Math.abs(current - next) / 1000; // seconds

      if (diff < 1) {
        // Count requests within 10 seconds
        let count = 1;
        for (let j = i + 1; j < logs.length; j++) {
          const logTime = new Date(logs[j].createdAt);
          if (Math.abs(current - logTime) / 1000 < 10) {
            count++;
          } else {
            break;
          }
        }

        if (count > 10) {
          return { count, seconds: 10 };
        }
      }
    }

    return null;
  }

  async _detectNewIPs(token, logs) {
    // Get historical IPs from older logs
    const historicalLogs = await AuditLog.findAll({
      where: {
        resourceId: token.id,
        createdAt: {
          [Sequelize.Op.lt]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    });

    const historicalIPs = new Set(
      historicalLogs.map(log => log.metadata?.ip).filter(Boolean)
    );

    const newIPs = logs
      .map(log => log.metadata?.ip)
      .filter(Boolean)
      .filter(ip => !historicalIPs.has(ip));

    return [...new Set(newIPs)];
  }

  _detectPermissionEscalation(logs) {
    const failedAttempts = logs.filter(log => !log.success && log.errorMessage?.includes('permission'));
    return failedAttempts.length > 5;
  }

  _calculateAverageSeverity(anomalies) {
    const severityScores = { low: 0.2, medium: 0.5, high: 0.8, critical: 1.0 };
    const total = anomalies.reduce((sum, a) => sum + severityScores[a.severity], 0);
    return total / anomalies.length;
  }

  _generateRecommendation(anomalies) {
    if (anomalies.length === 0) {
      return 'No anomalies detected. Token usage appears normal.';
    }

    const critical = anomalies.filter(a => a.severity === 'critical');
    if (critical.length > 0) {
      return 'CRITICAL: Immediate revocation recommended. Potential security breach detected.';
    }

    const high = anomalies.filter(a => a.severity === 'high');
    if (high.length > 0) {
      return 'HIGH RISK: Consider suspending token and investigating usage patterns.';
    }

    return 'MEDIUM RISK: Monitor token usage closely. Consider implementing stricter policies.';
  }

  _getTopActions(logs) {
    const actionCounts = {};
    logs.forEach(log => {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
    });

    return Object.entries(actionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([action, count]) => ({ action, count }));
  }

  _getPeakHours(logs) {
    const hourCounts = Array(24).fill(0);
    logs.forEach(log => {
      hourCounts[new Date(log.createdAt).getHours()]++;
    });

    return hourCounts
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }

  async _getRiskDistribution() {
    const tokens = await VaultToken.findAll({
      attributes: ['riskScore'],
      where: { status: 'active' }
    });

    const distribution = { low: 0, medium: 0, high: 0, critical: 0 };

    tokens.forEach(token => {
      if (token.riskScore < 0.3) distribution.low++;
      else if (token.riskScore < 0.6) distribution.medium++;
      else if (token.riskScore < 0.8) distribution.high++;
      else distribution.critical++;
    });

    return distribution;
  }

  _analyzeTrends(logs) {
    // Simple 7-day trend analysis
    const days = 7;
    const now = new Date();
    const dailyCounts = Array(days).fill(0);

    logs.forEach(log => {
      const logDate = new Date(log.createdAt);
      const daysDiff = Math.floor((now - logDate) / (1000 * 60 * 60 * 24));
      if (daysDiff < days) {
        dailyCounts[days - 1 - daysDiff]++;
      }
    });

    // Calculate trend (increasing/decreasing/stable)
    const recentAvg = dailyCounts.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const olderAvg = dailyCounts.slice(0, 3).reduce((a, b) => a + b, 0) / 3;

    let trend = 'stable';
    if (recentAvg > olderAvg * 1.2) trend = 'increasing';
    else if (recentAvg < olderAvg * 0.8) trend = 'decreasing';

    return { dailyCounts, trend };
  }
}

module.exports = new AIPolicyService();
