const { AuditLog } = require('../models');
const logger = require('../utils/logger');

/**
 * Audit Service
 * Handles audit logging for all vault operations
 */
class AuditService {
  /**
   * Log an audit event
   * @param {Object} data - Audit log data
   */
  async log(data) {
    try {
      const {
        action,
        resourceType,
        resourceId,
        resourcePath,
        actor,
        actorIp,
        tokenId,
        success = true,
        errorMessage,
        metadata = {},
        duration,
        requestId,
        userAgent
      } = data;

      await AuditLog.create({
        action,
        resourceType,
        resourceId,
        resourcePath,
        actor,
        actorIp,
        tokenId,
        success,
        errorMessage,
        metadata,
        duration,
        requestId,
        userAgent,
        timestamp: new Date()
      });

      logger.debug('Audit log created', {
        action,
        resourceType,
        resourceId,
        actor,
        success
      });
    } catch (error) {
      // Don't throw - audit logging should not break operations
      logger.error('Failed to create audit log', {
        error: error.message,
        data
      });
    }
  }

  /**
   * Get audit logs with filters
   * @param {Object} filters - Filter options
   * @returns {Array} Audit logs
   */
  async getLogs(filters = {}) {
    try {
      const {
        resourceType,
        resourceId,
        resourcePath,
        actor,
        action,
        success,
        startDate,
        endDate,
        limit = 100,
        offset = 0
      } = filters;

      const where = {};

      if (resourceType) where.resourceType = resourceType;
      if (resourceId) where.resourceId = resourceId;
      if (resourcePath) where.resourcePath = resourcePath;
      if (actor) where.actor = actor;
      if (action) where.action = action;
      if (success !== undefined) where.success = success;

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.$gte = new Date(startDate);
        if (endDate) where.timestamp.$lte = new Date(endDate);
      }

      const logs = await AuditLog.findAll({
        where,
        limit,
        offset,
        order: [['timestamp', 'DESC']]
      });

      return logs;
    } catch (error) {
      logger.error('Failed to get audit logs', { error: error.message });
      throw error;
    }
  }

  /**
   * Get audit statistics
   * @param {Object} filters - Filter options
   * @returns {Object} Statistics
   */
  async getStats(filters = {}) {
    try {
      const { startDate, endDate, actor, resourceType } = filters;

      const where = {};
      if (actor) where.actor = actor;
      if (resourceType) where.resourceType = resourceType;

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.$gte = new Date(startDate);
        if (endDate) where.timestamp.$lte = new Date(endDate);
      }

      const total = await AuditLog.count({ where });

      const successCount = await AuditLog.count({
        where: { ...where, success: true }
      });

      const failureCount = await AuditLog.count({
        where: { ...where, success: false }
      });

      // Get action breakdown
      const actionStats = await AuditLog.findAll({
        where,
        attributes: [
          'action',
          [AuditLog.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['action'],
        raw: true
      });

      // Get resource type breakdown
      const resourceStats = await AuditLog.findAll({
        where,
        attributes: [
          'resourceType',
          [AuditLog.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['resourceType'],
        raw: true
      });

      return {
        total,
        success: successCount,
        failures: failureCount,
        successRate: total > 0 ? (successCount / total * 100).toFixed(2) : 0,
        byAction: actionStats.reduce((acc, stat) => {
          acc[stat.action] = parseInt(stat.count);
          return acc;
        }, {}),
        byResourceType: resourceStats.reduce((acc, stat) => {
          acc[stat.resourceType] = parseInt(stat.count);
          return acc;
        }, {})
      };
    } catch (error) {
      logger.error('Failed to get audit statistics', { error: error.message });
      throw error;
    }
  }

  /**
   * Export audit logs to CSV
   * @param {Object} filters - Filter options
   * @returns {string} CSV data
   */
  async exportToCSV(filters = {}) {
    try {
      const logs = await this.getLogs({ ...filters, limit: 10000 });

      const headers = [
        'Timestamp',
        'Action',
        'Resource Type',
        'Resource ID',
        'Resource Path',
        'Actor',
        'Actor IP',
        'Success',
        'Error Message',
        'Duration (ms)'
      ];

      const rows = logs.map(log => [
        log.timestamp.toISOString(),
        log.action,
        log.resourceType,
        log.resourceId || '',
        log.resourcePath || '',
        log.actor,
        log.actorIp || '',
        log.success ? 'Yes' : 'No',
        log.errorMessage || '',
        log.duration || ''
      ]);

      const csvData = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');

      return csvData;
    } catch (error) {
      logger.error('Failed to export audit logs', { error: error.message });
      throw error;
    }
  }
}

module.exports = new AuditService();
