/**
 * ═══════════════════════════════════════════════════════════════════════
 * Alert Service
 * ═══════════════════════════════════════════════════════════════════════
 * Manages system alerts and notifications
 * ═══════════════════════════════════════════════════════════════════════
 */

const logger = require('../../utils/logger');

class AlertService {
  constructor() {
    // In-memory alerts (will be replaced with database table in Phase 5)
    this.alerts = [];
  }

  /**
   * Create a new alert
   */
  async createAlert(alert) {
    const record = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      severity: alert.severity || 'info', // info, warning, error, critical
      title: alert.title,
      message: alert.message,
      category: alert.category || 'system',
      source: alert.source || 'system',
      details: alert.details || {},
      triggeredAt: new Date().toISOString(),
      resolvedAt: null,
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null
    };

    this.alerts.unshift(record);

    logger.warn('Alert created', {
      severity: record.severity,
      title: record.title,
      category: record.category
    });

    // Emit alert via Socket.IO (will be implemented in Phase 1)
    // io.emit('alert:triggered', record);

    return record;
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(options = {}) {
    const {
      severity = null,
      category = null,
      includeResolved = false
    } = options;

    let filtered = [...this.alerts];

    // Filter out resolved alerts
    if (!includeResolved) {
      filtered = filtered.filter(a => !a.resolvedAt);
    }

    // Filter by severity
    if (severity) {
      filtered = filtered.filter(a => a.severity === severity);
    }

    // Filter by category
    if (category) {
      filtered = filtered.filter(a => a.category === category);
    }

    // Group by severity
    const bySeverity = {
      critical: filtered.filter(a => a.severity === 'critical').length,
      error: filtered.filter(a => a.severity === 'error').length,
      warning: filtered.filter(a => a.severity === 'warning').length,
      info: filtered.filter(a => a.severity === 'info').length
    };

    return {
      alerts: filtered,
      total: filtered.length,
      bySeverity
    };
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId, userId, userName) {
    const alert = this.alerts.find(a => a.id === alertId);

    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    if (alert.acknowledged) {
      throw new Error('Alert already acknowledged');
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = userId;
    alert.acknowledgedByName = userName;
    alert.acknowledgedAt = new Date().toISOString();

    logger.info('Alert acknowledged', {
      alertId,
      userId,
      severity: alert.severity
    });

    return alert;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId, userId, resolution) {
    const alert = this.alerts.find(a => a.id === alertId);

    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    if (alert.resolvedAt) {
      throw new Error('Alert already resolved');
    }

    alert.resolvedAt = new Date().toISOString();
    alert.resolvedBy = userId;
    alert.resolution = resolution;

    logger.info('Alert resolved', {
      alertId,
      userId,
      severity: alert.severity
    });

    return alert;
  }

  /**
   * Get alert statistics
   */
  async getAlertStats(period = '24h') {
    const now = new Date();
    let cutoff;

    switch (period) {
      case '1h':
        cutoff = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const recentAlerts = this.alerts.filter(a => {
      return new Date(a.triggeredAt) >= cutoff;
    });

    const bySeverity = {
      critical: 0,
      error: 0,
      warning: 0,
      info: 0
    };

    for (const alert of recentAlerts) {
      bySeverity[alert.severity]++;
    }

    return {
      period,
      total: recentAlerts.length,
      active: recentAlerts.filter(a => !a.resolvedAt).length,
      resolved: recentAlerts.filter(a => a.resolvedAt).length,
      bySeverity
    };
  }

  /**
   * Clear resolved alerts older than specified days
   */
  async clearOldAlerts(days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const before = this.alerts.length;
    this.alerts = this.alerts.filter(a => {
      if (!a.resolvedAt) return true; // Keep active alerts
      return new Date(a.resolvedAt) >= cutoff; // Keep recent resolved alerts
    });

    const removed = before - this.alerts.length;

    logger.info('Old alerts cleared', { removed, days });

    return { removed };
  }
}

module.exports = new AlertService();
