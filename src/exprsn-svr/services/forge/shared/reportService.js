/**
 * Report Service
 * Handles report generation, execution, caching, and management
 */

const { Report, ReportSchedule, ReportExecution } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const redis = require('../../config/redis');
const crypto = require('crypto');

// Import specific report generators
const financialReportingService = require('../erp/financialReportingService');
const crmReportService = require('../crm/reportService');
const groupwareReportService = require('../groupware/reportService');

class ReportService {
  constructor() {
    this.cachePrefix = 'report:';
    this.defaultCacheDuration = 900; // 15 minutes in seconds
  }

  /**
   * Create a new report definition
   */
  async createReport(userId, reportData) {
    try {
      const report = await Report.create({
        ...reportData,
        ownerId: userId,
        status: reportData.status || 'draft'
      });

      logger.info('Report created', {
        reportId: report.id,
        userId,
        reportType: report.reportType
      });

      return report;
    } catch (error) {
      logger.error('Failed to create report', { error: error.message });
      throw error;
    }
  }

  /**
   * Get report by ID
   */
  async getReport(reportId, userId) {
    const report = await Report.findOne({
      where: { id: reportId },
      include: [
        { association: 'schedules' },
        { association: 'executions', limit: 10, order: [['startedAt', 'DESC']] }
      ]
    });

    if (!report) {
      throw new Error('Report not found');
    }

    // Check access permissions
    if (!this.hasAccess(report, userId)) {
      throw new Error('Access denied');
    }

    return report;
  }

  /**
   * List reports for a user
   */
  async listReports(userId, options = {}) {
    const {
      reportType,
      category,
      status = 'active',
      visibility,
      search,
      favorites = false,
      templates = false,
      page = 1,
      limit = 20
    } = options;

    const where = {
      status
    };

    // Build where clause
    if (reportType) where.reportType = reportType;
    if (category) where.category = category;
    if (visibility) where.visibility = visibility;
    if (favorites) where.isFavorite = true;
    if (templates) where.isTemplate = true;

    // Search by name/description
    if (search) {
      const { Op } = require('sequelize');
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Access filter - own reports or shared reports
    const { Op } = require('sequelize');
    where[Op.or] = [
      { ownerId: userId },
      { sharedWith: { [Op.contains]: [userId] } },
      { visibility: { [Op.in]: ['organization', 'public'] } }
    ];

    const { rows: reports, count } = await Report.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [['lastExecutedAt', 'DESC NULLS LAST'], ['createdAt', 'DESC']],
      include: [
        {
          association: 'schedules',
          where: { isActive: true },
          required: false
        }
      ]
    });

    return {
      reports,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    };
  }

  /**
   * Execute a report
   */
  async executeReport(reportId, userId, parameters = {}, options = {}) {
    const startTime = Date.now();

    try {
      const report = await this.getReport(reportId, userId);

      // Check cache first
      if (!options.skipCache && report.cacheDurationMinutes > 0) {
        const cached = await this.getCachedResult(report, parameters);
        if (cached) {
          logger.info('Report served from cache', { reportId, userId });
          return {
            ...cached,
            fromCache: true
          };
        }
      }

      // Create execution record
      const execution = await ReportExecution.create({
        reportId: report.id,
        executedBy: userId,
        startedAt: new Date(),
        status: 'running',
        parameters
      });

      try {
        // Merge report config with runtime parameters
        const effectiveParams = {
          ...report.config,
          ...parameters
        };

        // Execute report based on type
        const result = await this.runReport(report, effectiveParams);

        // Calculate duration
        const duration = Date.now() - startTime;

        // Update execution record
        await execution.update({
          status: 'completed',
          completedAt: new Date(),
          durationMs: duration,
          rowCount: result.rowCount || 0,
          resultSize: JSON.stringify(result).length
        });

        // Update report statistics
        await this.updateReportStats(report, duration);

        // Cache result if enabled
        if (report.cacheDurationMinutes > 0) {
          await this.cacheResult(report, parameters, result, execution.id);
        }

        logger.info('Report executed successfully', {
          reportId,
          userId,
          duration,
          rowCount: result.rowCount
        });

        return {
          executionId: execution.id,
          result,
          duration,
          fromCache: false
        };

      } catch (execError) {
        // Update execution with error
        await execution.update({
          status: 'failed',
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
          error: execError.message,
          errorStack: execError.stack
        });

        throw execError;
      }

    } catch (error) {
      logger.error('Report execution failed', {
        reportId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Run the actual report based on type
   */
  async runReport(report, parameters) {
    switch (report.reportType) {
      // ERP Financial Reports
      case 'erp_financial':
        return await this.runERPFinancialReport(parameters);

      // CRM Reports
      case 'crm_contacts':
      case 'crm_leads':
      case 'crm_opportunities':
      case 'crm_activities':
      case 'crm_campaigns':
      case 'crm_tickets':
        return await this.runCRMReport(report.reportType, parameters);

      // Groupware Reports
      case 'groupware_tasks':
      case 'groupware_time_tracking':
      case 'groupware_projects':
        return await this.runGroupwareReport(report.reportType, parameters);

      // Custom SQL reports
      case 'custom':
        if (!report.customQuery) {
          throw new Error('Custom query not defined');
        }
        return await this.runCustomQuery(report.customQuery, parameters);

      default:
        throw new Error(`Unsupported report type: ${report.reportType}`);
    }
  }

  /**
   * Run ERP financial report
   */
  async runERPFinancialReport(parameters) {
    const { reportName, ...params } = parameters;

    switch (reportName) {
      case 'balanceSheet':
        return await financialReportingService.getBalanceSheet(params.asOfDate);
      case 'profitAndLoss':
        return await financialReportingService.getProfitAndLoss(params.startDate, params.endDate);
      case 'cashFlow':
        return await financialReportingService.getCashFlowStatement(params.startDate, params.endDate);
      case 'trialBalance':
        return await financialReportingService.getTrialBalance(params.asOfDate);
      case 'generalLedger':
        return await financialReportingService.getGeneralLedger(params.accountId, params.startDate, params.endDate);
      case 'arAging':
        return await financialReportingService.getARAgingReport();
      case 'apAging':
        return await financialReportingService.getAPAgingReport();
      case 'financialRatios':
        return await financialReportingService.getFinancialRatios(params.asOfDate);
      default:
        throw new Error(`Unknown ERP financial report: ${reportName}`);
    }
  }

  /**
   * Run CRM report (placeholder - implement based on your CRM services)
   */
  async runCRMReport(reportType, parameters) {
    // TODO: Implement CRM report generation
    // This would integrate with your CRM services
    return {
      reportType,
      parameters,
      data: [],
      rowCount: 0,
      generatedAt: new Date()
    };
  }

  /**
   * Run Groupware report (placeholder - implement based on your Groupware services)
   */
  async runGroupwareReport(reportType, parameters) {
    // TODO: Implement Groupware report generation
    // This would integrate with your Groupware services (tasks, time tracking, etc.)
    return {
      reportType,
      parameters,
      data: [],
      rowCount: 0,
      generatedAt: new Date()
    };
  }

  /**
   * Run custom SQL query (DANGEROUS - needs sanitization and permissions)
   */
  async runCustomQuery(query, parameters) {
    // TODO: Implement safe custom query execution
    // - Whitelist allowed tables
    // - Prevent write operations
    // - Parameter binding
    // - Query timeout
    throw new Error('Custom queries not yet implemented');
  }

  /**
   * Generate cache key for report + parameters
   */
  getCacheKey(report, parameters) {
    const paramString = JSON.stringify(parameters);
    const hash = crypto.createHash('md5').update(paramString).digest('hex');
    return `${this.cachePrefix}${report.id}:${hash}`;
  }

  /**
   * Get cached report result
   */
  async getCachedResult(report, parameters) {
    if (!redis.enabled) return null;

    try {
      const cacheKey = this.getCacheKey(report, parameters);
      const cached = await redis.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn('Cache retrieval failed', { error: error.message });
    }

    return null;
  }

  /**
   * Cache report result
   */
  async cacheResult(report, parameters, result, executionId) {
    if (!redis.enabled) return;

    try {
      const cacheKey = this.getCacheKey(report, parameters);
      const cacheDuration = report.cacheDurationMinutes * 60; // Convert to seconds

      const cacheData = {
        result,
        executionId,
        cachedAt: new Date().toISOString()
      };

      await redis.setex(cacheKey, cacheDuration, JSON.stringify(cacheData));

      logger.debug('Report result cached', {
        reportId: report.id,
        cacheKey,
        duration: cacheDuration
      });
    } catch (error) {
      logger.warn('Cache storage failed', { error: error.message });
    }
  }

  /**
   * Update report execution statistics
   */
  async updateReportStats(report, duration) {
    const currentAvg = report.avgExecutionDurationMs || 0;
    const currentCount = report.executionCount || 0;

    const newAvg = Math.round(
      (currentAvg * currentCount + duration) / (currentCount + 1)
    );

    await report.update({
      executionCount: currentCount + 1,
      lastExecutedAt: new Date(),
      lastExecutionDurationMs: duration,
      avgExecutionDurationMs: newAvg
    });
  }

  /**
   * Check if user has access to report
   */
  hasAccess(report, userId) {
    // Owner always has access
    if (report.ownerId === userId) return true;

    // Check if shared with user
    if (report.sharedWith && report.sharedWith.includes(userId)) return true;

    // Check visibility
    if (report.visibility === 'public') return true;
    if (report.visibility === 'organization') return true; // TODO: Check org membership

    return false;
  }

  /**
   * Share report with users
   */
  async shareReport(reportId, userId, sharedWithUserIds) {
    const report = await this.getReport(reportId, userId);

    if (report.ownerId !== userId) {
      throw new Error('Only report owner can share');
    }

    const currentSharedWith = report.sharedWith || [];
    const updatedSharedWith = [...new Set([...currentSharedWith, ...sharedWithUserIds])];

    await report.update({ sharedWith: updatedSharedWith });

    logger.info('Report shared', {
      reportId,
      sharedBy: userId,
      sharedWith: sharedWithUserIds
    });

    return report;
  }

  /**
   * Update report
   */
  async updateReport(reportId, userId, updates) {
    const report = await this.getReport(reportId, userId);

    if (report.ownerId !== userId) {
      throw new Error('Only report owner can update');
    }

    await report.update(updates);

    logger.info('Report updated', { reportId, userId });

    return report;
  }

  /**
   * Delete/archive report
   */
  async deleteReport(reportId, userId) {
    const report = await this.getReport(reportId, userId);

    if (report.ownerId !== userId) {
      throw new Error('Only report owner can delete');
    }

    await report.update({ status: 'archived' });

    logger.info('Report archived', { reportId, userId });

    return true;
  }

  /**
   * Get report execution history
   */
  async getExecutionHistory(reportId, userId, options = {}) {
    await this.getReport(reportId, userId); // Check access

    const { page = 1, limit = 50 } = options;

    const { rows: executions, count } = await ReportExecution.findAndCountAll({
      where: { reportId },
      limit,
      offset: (page - 1) * limit,
      order: [['startedAt', 'DESC']]
    });

    return {
      executions,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    };
  }

  /**
   * Get execution by ID
   */
  async getExecution(executionId, userId) {
    const execution = await ReportExecution.findByPk(executionId, {
      include: [{ association: 'report' }]
    });

    if (!execution) {
      throw new Error('Execution not found');
    }

    // Check access to parent report
    if (!this.hasAccess(execution.report, userId)) {
      throw new Error('Access denied');
    }

    return execution;
  }

  /**
   * Clear report cache
   */
  async clearCache(reportId, userId) {
    const report = await this.getReport(reportId, userId);

    if (!redis.enabled) {
      return { cleared: 0 };
    }

    try {
      const pattern = `${this.cachePrefix}${reportId}:*`;
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        await redis.del(...keys);
      }

      logger.info('Report cache cleared', {
        reportId,
        userId,
        keysCleared: keys.length
      });

      return { cleared: keys.length };
    } catch (error) {
      logger.error('Failed to clear cache', { error: error.message });
      throw error;
    }
  }
}

module.exports = new ReportService();
