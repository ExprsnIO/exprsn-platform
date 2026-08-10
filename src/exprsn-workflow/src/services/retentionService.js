const { Op } = require('sequelize');
const WorkflowExecution = require('../models/WorkflowExecution');
const WorkflowLog = require('../models/WorkflowLog');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');
const auditService = require('./auditService');

class RetentionService {
  constructor() {
    this.defaultRetentionDays = parseInt(process.env.RETENTION_DAYS, 10) || 90;
    this.archiveEnabled = process.env.ARCHIVE_ENABLED !== 'false';
    this.deleteAfterArchive = process.env.DELETE_AFTER_ARCHIVE === 'true';
  }

  /**
   * Archive old workflow executions
   */
  async archiveExecutions(options = {}) {
    const {
      retentionDays = this.defaultRetentionDays,
      batchSize = 100,
      workflowId = null
    } = options;

    const startTime = Date.now();
    let totalArchived = 0;
    let totalDeleted = 0;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      logger.info('Starting execution archival', {
        cutoffDate,
        retentionDays,
        workflowId
      });

      const where = {
        completed_at: {
          [Op.lt]: cutoffDate
        },
        status: {
          [Op.in]: ['completed', 'failed', 'cancelled', 'timeout']
        }
      };

      if (workflowId) {
        where.workflow_id = workflowId;
      }

      // Get count of executions to archive
      const count = await WorkflowExecution.count({ where });

      if (count === 0) {
        logger.info('No executions to archive');
        return {
          success: true,
          archived: 0,
          deleted: 0,
          duration: Date.now() - startTime
        };
      }

      logger.info(`Found ${count} executions to archive`);

      // Process in batches
      let offset = 0;
      while (offset < count) {
        const executions = await WorkflowExecution.findAll({
          where,
          limit: batchSize,
          offset,
          include: [
            {
              model: WorkflowLog,
              as: 'logs'
            }
          ]
        });

        if (executions.length === 0) break;

        // Archive each execution
        for (const execution of executions) {
          try {
            await this._archiveExecution(execution);
            totalArchived++;

            // Optionally delete after archiving
            if (this.deleteAfterArchive) {
              await execution.destroy();
              totalDeleted++;
            }
          } catch (error) {
            logger.error('Failed to archive execution', {
              executionId: execution.id,
              error: error.message
            });
          }
        }

        offset += batchSize;

        // Log progress
        logger.info('Archival progress', {
          processed: offset,
          total: count,
          percentage: Math.round((offset / count) * 100)
        });
      }

      const duration = Date.now() - startTime;

      logger.info('Archival completed', {
        totalArchived,
        totalDeleted,
        duration
      });

      // Log audit event
      await auditService.log({
        eventType: 'config_change',
        metadata: {
          operation: 'execution_archival',
          retentionDays,
          totalArchived,
          totalDeleted
        },
        durationMs: duration
      });

      return {
        success: true,
        archived: totalArchived,
        deleted: totalDeleted,
        duration
      };
    } catch (error) {
      logger.error('Archival failed', {
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        archived: totalArchived,
        deleted: totalDeleted,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Archive a single execution
   */
  async _archiveExecution(execution) {
    const archiveData = {
      execution: execution.toJSON(),
      logs: execution.logs ? execution.logs.map(log => log.toJSON()) : [],
      archivedAt: new Date().toISOString(),
      archivedBy: 'retention-service'
    };

    // For now, just log the archive (in production, write to S3/cold storage)
    logger.info('Execution archived', {
      executionId: execution.id,
      workflowId: execution.workflow_id,
      status: execution.status,
      completedAt: execution.completed_at,
      dataSize: JSON.stringify(archiveData).length
    });

    // TODO: Implement actual archive storage (S3, etc.)
    // await this._writeToArchiveStorage(archiveData);

    return archiveData;
  }

  /**
   * Archive old logs
   */
  async archiveLogs(options = {}) {
    const {
      retentionDays = this.defaultRetentionDays,
      batchSize = 1000
    } = options;

    const startTime = Date.now();

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      logger.info('Starting log archival', {
        cutoffDate,
        retentionDays
      });

      const deleted = await WorkflowLog.destroy({
        where: {
          timestamp: {
            [Op.lt]: cutoffDate
          }
        }
      });

      const duration = Date.now() - startTime;

      logger.info('Log archival completed', {
        deleted,
        duration
      });

      return {
        success: true,
        deleted,
        duration
      };
    } catch (error) {
      logger.error('Log archival failed', {
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Get retention statistics
   */
  async getStatistics() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.defaultRetentionDays);

      const [total, archivable, recentCompleted, recentFailed] = await Promise.all([
        WorkflowExecution.count(),
        WorkflowExecution.count({
          where: {
            completed_at: {
              [Op.lt]: cutoffDate
            },
            status: {
              [Op.in]: ['completed', 'failed', 'cancelled', 'timeout']
            }
          }
        }),
        WorkflowExecution.count({
          where: {
            completed_at: {
              [Op.gte]: cutoffDate
            },
            status: 'completed'
          }
        }),
        WorkflowExecution.count({
          where: {
            completed_at: {
              [Op.gte]: cutoffDate
            },
            status: 'failed'
          }
        })
      ]);

      const totalLogs = await WorkflowLog.count();
      const oldLogs = await WorkflowLog.count({
        where: {
          timestamp: {
            [Op.lt]: cutoffDate
          }
        }
      });

      return {
        executions: {
          total,
          archivable,
          recentCompleted,
          recentFailed,
          retentionDays: this.defaultRetentionDays,
          cutoffDate
        },
        logs: {
          total: totalLogs,
          old: oldLogs,
          retentionDays: this.defaultRetentionDays
        },
        settings: {
          archiveEnabled: this.archiveEnabled,
          deleteAfterArchive: this.deleteAfterArchive,
          retentionDays: this.defaultRetentionDays
        }
      };
    } catch (error) {
      logger.error('Failed to get retention statistics', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Restore archived execution (placeholder)
   */
  async restoreExecution(executionId) {
    // TODO: Implement restore from archive storage
    logger.warn('Restore functionality not yet implemented', {
      executionId
    });

    throw new Error('Restore functionality coming soon');
  }

  /**
   * Configure retention policies
   */
  updateRetentionPolicy(retentionDays, archiveEnabled, deleteAfterArchive) {
    this.defaultRetentionDays = retentionDays;
    this.archiveEnabled = archiveEnabled;
    this.deleteAfterArchive = deleteAfterArchive;

    logger.info('Retention policy updated', {
      retentionDays,
      archiveEnabled,
      deleteAfterArchive
    });
  }

  /**
   * Prune old data (hard delete)
   */
  async pruneOldData(options = {}) {
    const {
      retentionDays = this.defaultRetentionDays,
      includeCompleted = false
    } = options;

    const startTime = Date.now();

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      logger.warn('Starting data pruning (hard delete)', {
        cutoffDate,
        retentionDays,
        includeCompleted
      });

      const where = {
        completed_at: {
          [Op.lt]: cutoffDate
        },
        status: {
          [Op.in]: includeCompleted
            ? ['completed', 'failed', 'cancelled', 'timeout']
            : ['failed', 'cancelled', 'timeout']
        }
      };

      const count = await WorkflowExecution.count({ where });

      if (count === 0) {
        logger.info('No data to prune');
        return {
          success: true,
          deleted: 0,
          duration: Date.now() - startTime
        };
      }

      // Delete executions (cascade will delete logs)
      const deleted = await WorkflowExecution.destroy({ where });

      const duration = Date.now() - startTime;

      logger.warn('Data pruning completed', {
        deleted,
        duration
      });

      // Log audit event
      await auditService.log({
        eventType: 'config_change',
        metadata: {
          operation: 'data_pruning',
          retentionDays,
          includeCompleted,
          deleted
        },
        durationMs: duration,
        severity: 'warning'
      });

      return {
        success: true,
        deleted,
        duration
      };
    } catch (error) {
      logger.error('Data pruning failed', {
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }
}

module.exports = new RetentionService();
