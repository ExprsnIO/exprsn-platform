/**
 * Report Scheduling Service
 * Handles automated report execution based on schedules
 */

const cron = require('node-cron');
const moment = require('moment-timezone');
const { ReportSchedule, Report } = require('../../../models/forge');
const reportService = require('./reportService');
const reportExportService = require('./reportExportService');
const logger = require('../../../utils/logger');

class ReportSchedulingService {
  constructor() {
    this.scheduledJobs = new Map(); // Map of scheduleId -> cron job
    this.isInitialized = false;
  }

  /**
   * Initialize the scheduling service
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('Report scheduling service already initialized');
      return;
    }

    logger.info('Initializing report scheduling service');

    // Load all active schedules
    await this.loadActiveSchedules();

    // Schedule cleanup of expired exports (runs daily at 2am)
    cron.schedule('0 2 * * *', async () => {
      try {
        await reportExportService.cleanupExpiredExports();
      } catch (error) {
        logger.error('Export cleanup failed', { error: error.message });
      }
    });

    this.isInitialized = true;
    logger.info('Report scheduling service initialized', {
      activeSchedules: this.scheduledJobs.size
    });
  }

  /**
   * Load and start all active schedules
   */
  async loadActiveSchedules() {
    try {
      const schedules = await ReportSchedule.findAll({
        where: { isActive: true },
        include: [{ association: 'report', required: true }]
      });

      for (const schedule of schedules) {
        await this.startSchedule(schedule);
      }

      logger.info('Loaded active schedules', { count: schedules.length });
    } catch (error) {
      logger.error('Failed to load schedules', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a new schedule
   */
  async createSchedule(userId, scheduleData) {
    try {
      // Validate report exists and user has access
      const report = await reportService.getReport(scheduleData.reportId, userId);

      if (report.ownerId !== userId) {
        throw new Error('Only report owner can create schedules');
      }

      // Calculate next run time
      const nextRunAt = this.calculateNextRun(scheduleData);

      const schedule = await ReportSchedule.create({
        ...scheduleData,
        createdBy: userId,
        nextRunAt
      });

      // Start the schedule if active
      if (schedule.isActive) {
        await this.startSchedule(schedule);
      }

      logger.info('Report schedule created', {
        scheduleId: schedule.id,
        reportId: schedule.reportId,
        userId
      });

      return schedule;
    } catch (error) {
      logger.error('Failed to create schedule', { error: error.message });
      throw error;
    }
  }

  /**
   * Start a schedule (create cron job)
   */
  async startSchedule(schedule) {
    try {
      // Stop existing job if any
      this.stopSchedule(schedule.id);

      // Get cron expression
      const cronExpression = this.getCronExpression(schedule);

      if (!cronExpression) {
        logger.warn('Invalid schedule configuration', { scheduleId: schedule.id });
        return;
      }

      // Validate cron expression
      if (!cron.validate(cronExpression)) {
        logger.error('Invalid cron expression', {
          scheduleId: schedule.id,
          cronExpression
        });
        return;
      }

      // Create and start cron job
      const job = cron.schedule(cronExpression, async () => {
        await this.executeScheduledReport(schedule.id);
      }, {
        timezone: schedule.timezone || 'UTC'
      });

      this.scheduledJobs.set(schedule.id, job);

      logger.info('Schedule started', {
        scheduleId: schedule.id,
        cronExpression,
        timezone: schedule.timezone
      });

    } catch (error) {
      logger.error('Failed to start schedule', {
        scheduleId: schedule.id,
        error: error.message
      });
    }
  }

  /**
   * Stop a schedule (destroy cron job)
   */
  stopSchedule(scheduleId) {
    const job = this.scheduledJobs.get(scheduleId);

    if (job) {
      job.stop();
      this.scheduledJobs.delete(scheduleId);

      logger.info('Schedule stopped', { scheduleId });
    }
  }

  /**
   * Execute a scheduled report
   */
  async executeScheduledReport(scheduleId) {
    try {
      const schedule = await ReportSchedule.findByPk(scheduleId, {
        include: [{ association: 'report' }]
      });

      if (!schedule || !schedule.isActive) {
        logger.warn('Schedule not found or inactive', { scheduleId });
        return;
      }

      logger.info('Executing scheduled report', {
        scheduleId,
        reportId: schedule.reportId,
        reportName: schedule.report.name
      });

      // Execute the report (use system user context)
      const result = await reportService.executeReport(
        schedule.reportId,
        schedule.createdBy,
        schedule.parameters,
        { skipCache: false }
      );

      // Export the report
      const exportResult = await reportExportService.exportReport(
        schedule.report,
        result.result,
        schedule.exportFormat
      );

      // Update execution record with export info
      const { ReportExecution } = require('../../../models/forge');
      await ReportExecution.update(
        {
          exportFormat: schedule.exportFormat,
          exportPath: exportResult.exportPath,
          exportUrl: exportResult.exportUrl,
          exportExpiresAt: exportResult.expiresAt,
          deliveryMethod: schedule.deliveryMethod,
          deliveryStatus: 'pending'
        },
        { where: { id: result.executionId } }
      );

      // Deliver the report
      await this.deliverReport(schedule, exportResult, result.executionId);

      // Update schedule statistics
      const nextRunAt = this.calculateNextRun(schedule);
      await schedule.update({
        lastRunAt: new Date(),
        nextRunAt,
        executionCount: (schedule.executionCount || 0) + 1
      });

      logger.info('Scheduled report completed', {
        scheduleId,
        executionId: result.executionId
      });

    } catch (error) {
      logger.error('Scheduled report execution failed', {
        scheduleId,
        error: error.message
      });

      // Update failure count
      await ReportSchedule.update(
        {
          failureCount: require('sequelize').literal('failure_count + 1'),
          lastError: error.message
        },
        { where: { id: scheduleId } }
      );
    }
  }

  /**
   * Deliver report via configured method
   */
  async deliverReport(schedule, exportResult, executionId) {
    const { ReportExecution } = require('../../../models/forge');

    try {
      switch (schedule.deliveryMethod) {
        case 'email':
          await this.deliverViaEmail(schedule, exportResult);
          break;

        case 'storage':
          // Already in storage, just log
          logger.info('Report saved to storage', {
            path: exportResult.exportPath
          });
          break;

        case 'webhook':
          await this.deliverViaWebhook(schedule, exportResult);
          break;

        case 'download':
          // Make available for download via URL
          logger.info('Report available for download', {
            url: exportResult.exportUrl
          });
          break;

        default:
          logger.warn('Unknown delivery method', {
            method: schedule.deliveryMethod
          });
      }

      // Update delivery status
      await ReportExecution.update(
        {
          deliveryStatus: 'sent',
          deliveredAt: new Date()
        },
        { where: { id: executionId } }
      );

    } catch (error) {
      logger.error('Report delivery failed', {
        scheduleId: schedule.id,
        method: schedule.deliveryMethod,
        error: error.message
      });

      // Update delivery status
      await ReportExecution.update(
        {
          deliveryStatus: 'failed',
          deliveryError: error.message
        },
        { where: { id: executionId } }
      );
    }
  }

  /**
   * Deliver via email (integrate with exprsn-herald)
   */
  async deliverViaEmail(schedule, exportResult) {
    // TODO: Integrate with exprsn-herald email service
    logger.info('Email delivery not yet implemented', {
      recipients: schedule.recipients,
      file: exportResult.exportPath
    });

    // Placeholder for herald integration:
    // const heraldUrl = await serviceDiscovery.getServiceUrl('exprsn-herald');
    // await axios.post(`${heraldUrl}/api/send-email`, {
    //   to: schedule.recipients,
    //   subject: `Scheduled Report: ${schedule.report.name}`,
    //   attachments: [{ path: exportResult.exportPath }]
    // });
  }

  /**
   * Deliver via webhook
   */
  async deliverViaWebhook(schedule, exportResult) {
    if (!schedule.webhookUrl) {
      throw new Error('Webhook URL not configured');
    }

    const axios = require('axios');

    await axios.post(schedule.webhookUrl, {
      scheduleId: schedule.id,
      reportId: schedule.reportId,
      reportName: schedule.report.name,
      exportUrl: exportResult.exportUrl,
      exportFormat: exportResult.format,
      executedAt: new Date().toISOString()
    }, {
      timeout: 10000
    });

    logger.info('Report delivered via webhook', {
      url: schedule.webhookUrl
    });
  }

  /**
   * Get cron expression for schedule
   */
  getCronExpression(schedule) {
    // If custom cron expression provided, use it
    if (schedule.frequency === 'custom' && schedule.cronExpression) {
      return schedule.cronExpression;
    }

    // Parse runAt time (default to 9:00 AM if not set)
    const runTime = schedule.runAt || '09:00:00';
    const [hour, minute] = runTime.split(':');

    switch (schedule.frequency) {
      case 'daily':
        return `${minute} ${hour} * * *`;

      case 'weekly':
        const dayOfWeek = schedule.dayOfWeek || 1; // Default to Monday
        return `${minute} ${hour} * * ${dayOfWeek}`;

      case 'monthly':
        const dayOfMonth = schedule.dayOfMonth || 1;
        return `${minute} ${hour} ${dayOfMonth} * *`;

      case 'quarterly':
        // Run on first day of Q1, Q2, Q3, Q4
        const quarterDay = schedule.dayOfMonth || 1;
        return `${minute} ${hour} ${quarterDay} 1,4,7,10 *`;

      case 'yearly':
        // Run on January 1st (or specified day)
        const yearDay = schedule.dayOfMonth || 1;
        return `${minute} ${hour} ${yearDay} 1 *`;

      case 'once':
        // For one-time schedules, don't create cron job
        // Handle separately via startDate
        return null;

      default:
        return null;
    }
  }

  /**
   * Calculate next run time
   */
  calculateNextRun(schedule) {
    const now = moment().tz(schedule.timezone || 'UTC');

    // Check if schedule has ended
    if (schedule.endDate && moment(schedule.endDate).isBefore(now)) {
      return null;
    }

    // Check if schedule hasn't started
    if (schedule.startDate && moment(schedule.startDate).isAfter(now)) {
      return schedule.startDate;
    }

    // For one-time schedules
    if (schedule.frequency === 'once') {
      return schedule.startDate || new Date();
    }

    // Get cron expression and calculate next occurrence
    const cronExpression = this.getCronExpression(schedule);
    if (!cronExpression) {
      return null;
    }

    // Parse cron and find next occurrence
    // This is a simplified calculation - in production use a library like 'cron-parser'
    const runTime = schedule.runAt || '09:00:00';
    const [hour, minute] = runTime.split(':');

    let next = now.clone();

    switch (schedule.frequency) {
      case 'daily':
        next.hours(parseInt(hour)).minutes(parseInt(minute)).seconds(0);
        if (next.isBefore(now)) {
          next.add(1, 'day');
        }
        break;

      case 'weekly':
        next.day(schedule.dayOfWeek || 1)
          .hours(parseInt(hour))
          .minutes(parseInt(minute))
          .seconds(0);
        if (next.isBefore(now)) {
          next.add(1, 'week');
        }
        break;

      case 'monthly':
        next.date(schedule.dayOfMonth || 1)
          .hours(parseInt(hour))
          .minutes(parseInt(minute))
          .seconds(0);
        if (next.isBefore(now)) {
          next.add(1, 'month');
        }
        break;

      default:
        // For complex schedules, add 1 day as fallback
        next.add(1, 'day');
    }

    return next.toDate();
  }

  /**
   * Update a schedule
   */
  async updateSchedule(scheduleId, userId, updates) {
    const schedule = await ReportSchedule.findByPk(scheduleId, {
      include: [{ association: 'report' }]
    });

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    if (schedule.createdBy !== userId) {
      throw new Error('Only schedule creator can update');
    }

    // Stop current job
    this.stopSchedule(scheduleId);

    // Update schedule
    await schedule.update(updates);

    // Recalculate next run time if frequency changed
    if (updates.frequency || updates.runAt || updates.dayOfWeek || updates.dayOfMonth) {
      const nextRunAt = this.calculateNextRun(schedule);
      await schedule.update({ nextRunAt });
    }

    // Restart if active
    if (schedule.isActive) {
      await this.startSchedule(schedule);
    }

    logger.info('Schedule updated', { scheduleId, userId });

    return schedule;
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(scheduleId, userId) {
    const schedule = await ReportSchedule.findByPk(scheduleId);

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    if (schedule.createdBy !== userId) {
      throw new Error('Only schedule creator can delete');
    }

    // Stop the job
    this.stopSchedule(scheduleId);

    // Delete the schedule
    await schedule.destroy();

    logger.info('Schedule deleted', { scheduleId, userId });

    return true;
  }

  /**
   * Get schedules for a report
   */
  async getReportSchedules(reportId, userId) {
    // Check access to report
    await reportService.getReport(reportId, userId);

    const schedules = await ReportSchedule.findAll({
      where: { reportId },
      order: [['createdAt', 'DESC']]
    });

    return schedules;
  }

  /**
   * Pause/resume schedule
   */
  async toggleSchedule(scheduleId, userId, isActive) {
    const schedule = await ReportSchedule.findByPk(scheduleId);

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    if (schedule.createdBy !== userId) {
      throw new Error('Unauthorized');
    }

    await schedule.update({ isActive });

    if (isActive) {
      await this.startSchedule(schedule);
    } else {
      this.stopSchedule(scheduleId);
    }

    logger.info('Schedule toggled', { scheduleId, isActive });

    return schedule;
  }

  /**
   * Shutdown - stop all jobs
   */
  shutdown() {
    for (const [scheduleId, job] of this.scheduledJobs.entries()) {
      job.stop();
    }
    this.scheduledJobs.clear();
    this.isInitialized = false;

    logger.info('Report scheduling service shut down');
  }
}

module.exports = new ReportSchedulingService();
