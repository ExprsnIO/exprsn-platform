const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

class AuditService {
  /**
   * Log an audit event
   */
  async log(event) {
    try {
      const {
        eventType,
        workflowId,
        executionId,
        stepId,
        userId,
        userIp,
        userAgent,
        changes,
        metadata,
        success = true,
        errorMessage,
        durationMs,
        severity = 'info'
      } = event;

      // Sanitize sensitive data
      const sanitizedChanges = this._sanitizeData(changes);
      const sanitizedMetadata = this._sanitizeData(metadata);

      const auditLog = await AuditLog.create({
        event_type: eventType,
        workflow_id: workflowId,
        execution_id: executionId,
        step_id: stepId,
        user_id: userId,
        user_ip: userIp,
        user_agent: userAgent,
        changes: sanitizedChanges,
        metadata: sanitizedMetadata,
        success,
        error_message: errorMessage,
        duration_ms: durationMs,
        severity
      });

      // Log to application logger as well
      const logLevel = severity === 'critical' || severity === 'error' ? 'error' :
                       severity === 'warning' ? 'warn' : 'info';

      logger[logLevel]('Audit event logged', {
        auditId: auditLog.id,
        eventType,
        workflowId,
        executionId,
        userId,
        success
      });

      return auditLog;
    } catch (error) {
      // Never fail the main operation due to audit logging failure
      logger.error('Failed to log audit event', {
        error: error.message,
        event
      });
      return null;
    }
  }

  /**
   * Log workflow creation
   */
  async logWorkflowCreate(workflow, userId, req) {
    return await this.log({
      eventType: 'workflow_create',
      workflowId: workflow.id,
      userId,
      userIp: req?.ip,
      userAgent: req?.get('user-agent'),
      metadata: {
        workflowName: workflow.name,
        workflowVersion: workflow.version,
        triggerType: workflow.trigger_type
      }
    });
  }

  /**
   * Log workflow update
   */
  async logWorkflowUpdate(workflow, previousValues, userId, req) {
    return await this.log({
      eventType: 'workflow_update',
      workflowId: workflow.id,
      userId,
      userIp: req?.ip,
      userAgent: req?.get('user-agent'),
      changes: {
        before: previousValues,
        after: {
          name: workflow.name,
          description: workflow.description,
          version: workflow.version,
          status: workflow.status
        }
      },
      metadata: {
        workflowName: workflow.name
      }
    });
  }

  /**
   * Log workflow deletion
   */
  async logWorkflowDelete(workflow, userId, req) {
    return await this.log({
      eventType: 'workflow_delete',
      workflowId: workflow.id,
      userId,
      userIp: req?.ip,
      userAgent: req?.get('user-agent'),
      metadata: {
        workflowName: workflow.name,
        workflowVersion: workflow.version
      },
      severity: 'warning'
    });
  }

  /**
   * Log workflow execution start
   */
  async logExecutionStart(execution, userId, req) {
    return await this.log({
      eventType: 'execution_start',
      workflowId: execution.workflow_id,
      executionId: execution.id,
      userId,
      userIp: req?.ip,
      userAgent: req?.get('user-agent'),
      metadata: {
        triggerType: execution.trigger_type,
        hasInput: !!execution.input_data
      }
    });
  }

  /**
   * Log workflow execution completion
   */
  async logExecutionComplete(execution, durationMs) {
    return await this.log({
      eventType: 'execution_complete',
      workflowId: execution.workflow_id,
      executionId: execution.id,
      userId: execution.user_id,
      durationMs,
      metadata: {
        status: execution.status,
        completedSteps: execution.completed_steps?.length || 0,
        totalSteps: Object.keys(execution.context?.steps || {}).length
      }
    });
  }

  /**
   * Log workflow execution failure
   */
  async logExecutionFail(execution, error, durationMs) {
    return await this.log({
      eventType: 'execution_fail',
      workflowId: execution.workflow_id,
      executionId: execution.id,
      userId: execution.user_id,
      success: false,
      errorMessage: error.message,
      durationMs,
      metadata: {
        failedStep: execution.failed_steps?.[0],
        completedSteps: execution.completed_steps?.length || 0
      },
      severity: 'error'
    });
  }

  /**
   * Log execution retry
   */
  async logExecutionRetry(originalExecution, newExecution, userId, req) {
    return await this.log({
      eventType: 'execution_retry',
      workflowId: originalExecution.workflow_id,
      executionId: newExecution.id,
      userId,
      userIp: req?.ip,
      userAgent: req?.get('user-agent'),
      metadata: {
        originalExecutionId: originalExecution.id,
        originalStatus: originalExecution.status,
        retryReason: 'manual'
      }
    });
  }

  /**
   * Log step execution
   */
  async logStepExecution(execution, step, success, error, durationMs) {
    return await this.log({
      eventType: success ? 'step_execute' : 'step_fail',
      workflowId: execution.workflow_id,
      executionId: execution.id,
      stepId: step.id,
      userId: execution.user_id,
      success,
      errorMessage: error?.message,
      durationMs,
      metadata: {
        stepType: step.step_type,
        stepName: step.name
      },
      severity: success ? 'info' : 'error'
    });
  }

  /**
   * Query audit logs with filters
   */
  async query(filters = {}, options = {}) {
    const {
      workflowId,
      executionId,
      userId,
      eventType,
      severity,
      success,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = { ...filters, ...options };

    const where = {};

    if (workflowId) where.workflow_id = workflowId;
    if (executionId) where.execution_id = executionId;
    if (userId) where.user_id = userId;
    if (eventType) where.event_type = eventType;
    if (severity) where.severity = severity;
    if (success !== undefined) where.success = success;

    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at[Op.gte] = new Date(startDate);
      if (endDate) where.created_at[Op.lte] = new Date(endDate);
    }

    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      limit,
      offset,
      order: [['created_at', 'DESC']]
    });

    return {
      logs: rows,
      total: count,
      limit,
      offset
    };
  }

  /**
   * Get audit statistics
   */
  async getStatistics(filters = {}) {
    const { workflowId, userId, startDate, endDate } = filters;

    const where = {};
    if (workflowId) where.workflow_id = workflowId;
    if (userId) where.user_id = userId;

    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at[Op.gte] = new Date(startDate);
      if (endDate) where.created_at[Op.lte] = new Date(endDate);
    }

    const [totalEvents, failedEvents, criticalEvents] = await Promise.all([
      AuditLog.count({ where }),
      AuditLog.count({ where: { ...where, success: false } }),
      AuditLog.count({ where: { ...where, severity: 'critical' } })
    ]);

    // Get event type distribution
    const eventTypeStats = await AuditLog.findAll({
      where,
      attributes: [
        'event_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['event_type'],
      raw: true
    });

    return {
      totalEvents,
      failedEvents,
      criticalEvents,
      successRate: totalEvents > 0 ? ((totalEvents - failedEvents) / totalEvents * 100).toFixed(2) : 100,
      eventTypes: eventTypeStats.reduce((acc, stat) => {
        acc[stat.event_type] = parseInt(stat.count);
        return acc;
      }, {})
    };
  }

  /**
   * Archive old audit logs
   */
  async archiveOldLogs(daysToKeep = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const deleted = await AuditLog.destroy({
      where: {
        created_at: {
          [Op.lt]: cutoffDate
        }
      }
    });

    logger.info('Archived old audit logs', {
      cutoffDate,
      deleted
    });

    return deleted;
  }

  /**
   * Sanitize sensitive data from audit logs
   */
  _sanitizeData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'api_key',
      'apiKey',
      'access_token',
      'accessToken',
      'private_key',
      'privateKey',
      'authorization',
      'cookie',
      'session'
    ];

    const sanitized = JSON.parse(JSON.stringify(data));

    const sanitizeObject = (obj) => {
      if (!obj || typeof obj !== 'object') return;

      for (const key in obj) {
        const lowerKey = key.toLowerCase();

        // Check if key contains sensitive information
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
          obj[key] = '***REDACTED***';
        } else if (typeof obj[key] === 'object') {
          sanitizeObject(obj[key]);
        }
      }
    };

    sanitizeObject(sanitized);
    return sanitized;
  }

  /**
   * Helper to extract request info
   */
  extractRequestInfo(req) {
    return {
      userIp: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get?.('user-agent') || req?.headers?.['user-agent']
    };
  }
}

module.exports = new AuditService();
