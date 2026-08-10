/**
 * Report Subscription Service
 * Manages user subscriptions to reports with scheduled delivery
 * Supports email notifications, conditional delivery, and digest mode
 */

const { ReportSchedule, Report, ReportExecution } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const cron = require('node-cron');
const moment = require('moment-timezone');

class ReportSubscriptionService {
  constructor() {
    this.activeSubscriptions = new Map();
    this.digestQueues = new Map(); // For digest mode subscriptions
  }

  /**
   * Subscribe user to a report
   */
  async subscribeToReport(userId, subscriptionData) {
    try {
      const {
        reportId,
        name,
        frequency = 'weekly',
        deliveryMethod = 'email',
        exportFormat = 'pdf',
        recipients = [],
        parameters = {},
        timezone = 'UTC',
        runAt = '09:00:00',
        dayOfWeek = 1, // Monday
        dayOfMonth = 1,
        startDate = null,
        endDate = null,
        conditions = null, // Conditional delivery
        digestMode = false, // Combine multiple reports
        customMessage = null
      } = subscriptionData;

      // Verify report exists and user has access
      const report = await Report.findOne({ where: { id: reportId } });
      if (!report) {
        throw new Error('Report not found');
      }

      // Add user to recipients if not already included
      if (!recipients.includes(userId)) {
        recipients.push(userId);
      }

      // Calculate next run time
      const nextRunAt = this.calculateNextRun(frequency, {
        runAt,
        dayOfWeek,
        dayOfMonth,
        timezone,
        startDate
      });

      // Create schedule
      const schedule = await ReportSchedule.create({
        reportId,
        name: name || `${report.name} Subscription`,
        frequency,
        runAt,
        dayOfWeek: frequency === 'weekly' ? dayOfWeek : null,
        dayOfMonth: frequency === 'monthly' ? dayOfMonth : null,
        timezone,
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        isActive: true,
        exportFormat,
        deliveryMethod,
        recipients,
        parameters: {
          ...parameters,
          conditions,
          digestMode,
          customMessage
        },
        nextRunAt,
        createdBy: userId
      });

      // Set up cron job for subscription
      await this.setupCronJob(schedule);

      logger.info('User subscribed to report', {
        subscriptionId: schedule.id,
        userId,
        reportId,
        frequency
      });

      return schedule;
    } catch (error) {
      logger.error('Failed to subscribe to report', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Unsubscribe user from a report
   */
  async unsubscribeFromReport(subscriptionId, userId) {
    try {
      const schedule = await ReportSchedule.findOne({
        where: { id: subscriptionId }
      });

      if (!schedule) {
        throw new Error('Subscription not found');
      }

      // Check if user has permission to unsubscribe
      if (schedule.createdBy !== userId && !schedule.recipients.includes(userId)) {
        throw new Error('Access denied');
      }

      // If user is creator, delete subscription entirely
      if (schedule.createdBy === userId) {
        await schedule.destroy();
        this.cancelCronJob(subscriptionId);
      } else {
        // Just remove user from recipients
        schedule.recipients = schedule.recipients.filter(r => r !== userId);
        await schedule.save();

        // If no recipients left, delete subscription
        if (schedule.recipients.length === 0) {
          await schedule.destroy();
          this.cancelCronJob(subscriptionId);
        }
      }

      logger.info('User unsubscribed from report', {
        subscriptionId,
        userId
      });

      return true;
    } catch (error) {
      logger.error('Failed to unsubscribe from report', {
        subscriptionId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user's subscriptions
   */
  async getUserSubscriptions(userId, options = {}) {
    try {
      const {
        isActive = null,
        reportId = null,
        page = 1,
        limit = 20
      } = options;

      const where = {
        recipients: { $contains: [userId] }
      };

      if (isActive !== null) where.isActive = isActive;
      if (reportId) where.reportId = reportId;

      const subscriptions = await ReportSchedule.findAll({
        where,
        include: [
          {
            association: 'report',
            attributes: ['id', 'name', 'reportType', 'category']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset: (page - 1) * limit
      });

      const count = await ReportSchedule.count({ where });

      return {
        subscriptions,
        total: count,
        page,
        totalPages: Math.ceil(count / limit)
      };
    } catch (error) {
      logger.error('Failed to get user subscriptions', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update subscription settings
   */
  async updateSubscription(subscriptionId, userId, updates) {
    try {
      const schedule = await ReportSchedule.findOne({
        where: { id: subscriptionId }
      });

      if (!schedule) {
        throw new Error('Subscription not found');
      }

      // Check permissions
      if (schedule.createdBy !== userId) {
        throw new Error('Access denied');
      }

      // Update allowed fields
      const allowedUpdates = [
        'name', 'frequency', 'runAt', 'dayOfWeek', 'dayOfMonth',
        'timezone', 'exportFormat', 'deliveryMethod', 'recipients',
        'parameters', 'isActive', 'startDate', 'endDate'
      ];

      Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key)) {
          schedule[key] = updates[key];
        }
      });

      // Recalculate next run if frequency changed
      if (updates.frequency || updates.runAt || updates.dayOfWeek || updates.dayOfMonth) {
        schedule.nextRunAt = this.calculateNextRun(schedule.frequency, {
          runAt: schedule.runAt,
          dayOfWeek: schedule.dayOfWeek,
          dayOfMonth: schedule.dayOfMonth,
          timezone: schedule.timezone
        });
      }

      await schedule.save();

      // Update cron job
      this.cancelCronJob(subscriptionId);
      if (schedule.isActive) {
        await this.setupCronJob(schedule);
      }

      logger.info('Subscription updated', {
        subscriptionId,
        userId
      });

      return schedule;
    } catch (error) {
      logger.error('Failed to update subscription', {
        subscriptionId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Execute subscription (generate and deliver report)
   */
  async executeSubscription(subscriptionId) {
    try {
      const schedule = await ReportSchedule.findOne({
        where: { id: subscriptionId },
        include: ['report']
      });

      if (!schedule || !schedule.isActive) {
        logger.warn('Inactive or missing subscription', { subscriptionId });
        return;
      }

      logger.info('Executing subscription', {
        subscriptionId,
        reportId: schedule.reportId
      });

      // Execute report
      const reportService = require('./reportService');
      const execution = await reportService.executeReport(
        schedule.reportId,
        schedule.createdBy,
        schedule.parameters
      );

      // Check conditional delivery
      if (schedule.parameters?.conditions) {
        const shouldDeliver = this.evaluateConditions(
          execution.result,
          schedule.parameters.conditions
        );

        if (!shouldDeliver) {
          logger.info('Conditional delivery criteria not met, skipping', {
            subscriptionId
          });

          schedule.lastRunAt = new Date();
          schedule.nextRunAt = this.calculateNextRun(schedule.frequency, schedule);
          schedule.executionCount += 1;
          await schedule.save();

          return { skipped: true, reason: 'conditions_not_met' };
        }
      }

      // Handle digest mode
      if (schedule.parameters?.digestMode) {
        await this.addToDigestQueue(schedule, execution.result);
        logger.info('Added to digest queue', { subscriptionId });
      } else {
        // Deliver immediately
        await this.deliverReport(schedule, execution.result);
      }

      // Update schedule
      schedule.lastRunAt = new Date();
      schedule.nextRunAt = this.calculateNextRun(schedule.frequency, schedule);
      schedule.executionCount += 1;
      schedule.failureCount = 0;
      schedule.lastError = null;
      await schedule.save();

      logger.info('Subscription executed successfully', {
        subscriptionId,
        executionId: execution.id
      });

      return { success: true, executionId: execution.id };
    } catch (error) {
      logger.error('Subscription execution failed', {
        subscriptionId,
        error: error.message
      });

      // Update failure tracking
      try {
        const schedule = await ReportSchedule.findByPk(subscriptionId);
        if (schedule) {
          schedule.failureCount += 1;
          schedule.lastError = error.message;
          schedule.nextRunAt = this.calculateNextRun(schedule.frequency, schedule);
          await schedule.save();
        }
      } catch (updateError) {
        logger.error('Failed to update schedule after error', {
          subscriptionId,
          error: updateError.message
        });
      }

      throw error;
    }
  }

  /**
   * Deliver report to recipients
   */
  async deliverReport(schedule, reportResult) {
    try {
      switch (schedule.deliveryMethod) {
        case 'email':
          await this.deliverViaEmail(schedule, reportResult);
          break;

        case 'storage':
          await this.deliverToStorage(schedule, reportResult);
          break;

        case 'webhook':
          await this.deliverViaWebhook(schedule, reportResult);
          break;

        default:
          logger.warn('Unknown delivery method', {
            method: schedule.deliveryMethod
          });
      }
    } catch (error) {
      logger.error('Failed to deliver report', {
        subscriptionId: schedule.id,
        deliveryMethod: schedule.deliveryMethod,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Deliver report via email
   */
  async deliverViaEmail(schedule, reportResult) {
    try {
      // Export report to requested format
      const reportExportService = require('./reportExportService');
      const exported = await reportExportService.exportReport(
        schedule.report,
        reportResult,
        schedule.exportFormat
      );

      // Send email to each recipient
      // This would integrate with exprsn-herald for email delivery
      const emailService = require('../../../shared/emailService');

      const customMessage = schedule.parameters?.customMessage || '';

      await emailService.sendEmail({
        to: schedule.recipients,
        subject: `${schedule.name} - ${moment().format('MMMM Do YYYY')}`,
        body: `
          <h2>${schedule.name}</h2>
          <p>Your scheduled report is ready.</p>
          ${customMessage ? `<p>${customMessage}</p>` : ''}
          <p><strong>Report Type:</strong> ${schedule.report.name}</p>
          <p><strong>Generated:</strong> ${moment().format('MMMM Do YYYY, h:mm a')}</p>
          <p><strong>Records:</strong> ${reportResult.rowCount || 0}</p>
          <p>Please see attached ${schedule.exportFormat.toUpperCase()} file.</p>
        `,
        attachments: [exported]
      });

      logger.info('Report delivered via email', {
        subscriptionId: schedule.id,
        recipients: schedule.recipients.length
      });
    } catch (error) {
      logger.error('Email delivery failed', {
        subscriptionId: schedule.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Deliver report to storage
   */
  async deliverToStorage(schedule, reportResult) {
    try {
      // Export and save to specified storage path
      const reportExportService = require('./reportExportService');
      const exported = await reportExportService.exportReport(
        schedule.report,
        reportResult,
        schedule.exportFormat
      );

      // Save to storage (would integrate with exprsn-filevault)
      const storageService = require('../../../shared/storageService');
      const filename = `${schedule.report.name}_${moment().format('YYYY-MM-DD')}.${schedule.exportFormat}`;

      await storageService.saveFile(
        schedule.storagePath,
        filename,
        exported.buffer
      );

      logger.info('Report delivered to storage', {
        subscriptionId: schedule.id,
        path: schedule.storagePath
      });
    } catch (error) {
      logger.error('Storage delivery failed', {
        subscriptionId: schedule.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Deliver report via webhook
   */
  async deliverViaWebhook(schedule, reportResult) {
    try {
      const axios = require('axios');

      await axios.post(schedule.webhookUrl, {
        subscriptionId: schedule.id,
        reportId: schedule.reportId,
        reportName: schedule.report.name,
        executedAt: new Date(),
        result: reportResult
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Exprsn-Forge-Subscriptions/1.0'
        }
      });

      logger.info('Report delivered via webhook', {
        subscriptionId: schedule.id,
        webhookUrl: schedule.webhookUrl
      });
    } catch (error) {
      logger.error('Webhook delivery failed', {
        subscriptionId: schedule.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Add report to digest queue
   */
  async addToDigestQueue(schedule, reportResult) {
    const digestKey = `${schedule.createdBy}_${schedule.frequency}`;

    if (!this.digestQueues.has(digestKey)) {
      this.digestQueues.set(digestKey, []);
    }

    this.digestQueues.get(digestKey).push({
      subscriptionId: schedule.id,
      reportName: schedule.report.name,
      reportType: schedule.report.reportType,
      result: reportResult,
      timestamp: new Date()
    });
  }

  /**
   * Send digest email (combine multiple reports)
   */
  async sendDigest(userId, frequency) {
    const digestKey = `${userId}_${frequency}`;
    const reports = this.digestQueues.get(digestKey) || [];

    if (reports.length === 0) {
      return;
    }

    try {
      // Combine all reports into single email
      const emailService = require('../../../shared/emailService');

      const reportSummaries = reports.map(r => `
        <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #ddd;">
          <h3>${r.reportName}</h3>
          <p><strong>Type:</strong> ${r.reportType}</p>
          <p><strong>Records:</strong> ${r.result.rowCount || 0}</p>
          <p><strong>Generated:</strong> ${moment(r.timestamp).format('h:mm a')}</p>
        </div>
      `).join('');

      await emailService.sendEmail({
        to: [userId],
        subject: `Report Digest - ${frequency} - ${moment().format('MMMM Do YYYY')}`,
        body: `
          <h2>Your ${frequency} Report Digest</h2>
          <p>Here's a summary of your ${reports.length} scheduled reports:</p>
          ${reportSummaries}
          <p><em>Individual reports are attached to this email.</em></p>
        `,
        attachments: [] // Would include all report exports
      });

      // Clear digest queue
      this.digestQueues.delete(digestKey);

      logger.info('Digest sent', {
        userId,
        frequency,
        reportCount: reports.length
      });
    } catch (error) {
      logger.error('Failed to send digest', {
        userId,
        frequency,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate next run time based on frequency
   */
  calculateNextRun(frequency, options) {
    const { runAt, dayOfWeek, dayOfMonth, timezone, startDate } = options;

    const now = moment().tz(timezone);
    let nextRun = now.clone();

    const [hour, minute] = (runAt || '09:00:00').split(':');
    nextRun.set({ hour: parseInt(hour), minute: parseInt(minute), second: 0 });

    switch (frequency) {
      case 'daily':
        if (nextRun.isBefore(now)) {
          nextRun.add(1, 'day');
        }
        break;

      case 'weekly':
        nextRun.day(dayOfWeek || 1); // Monday default
        if (nextRun.isBefore(now)) {
          nextRun.add(1, 'week');
        }
        break;

      case 'monthly':
        nextRun.date(dayOfMonth || 1);
        if (nextRun.isBefore(now)) {
          nextRun.add(1, 'month');
        }
        break;

      case 'quarterly':
        const currentQuarter = Math.floor(now.month() / 3);
        nextRun.month(currentQuarter * 3).date(1);
        if (nextRun.isBefore(now)) {
          nextRun.add(3, 'months');
        }
        break;

      case 'yearly':
        nextRun.month(0).date(1);
        if (nextRun.isBefore(now)) {
          nextRun.add(1, 'year');
        }
        break;

      case 'once':
        nextRun = startDate ? moment(startDate).tz(timezone) : now;
        break;
    }

    return nextRun.toDate();
  }

  /**
   * Setup cron job for subscription
   */
  async setupCronJob(schedule) {
    try {
      let cronExpression;

      if (schedule.frequency === 'custom' && schedule.cronExpression) {
        cronExpression = schedule.cronExpression;
      } else {
        cronExpression = this.getCronExpression(schedule);
      }

      const task = cron.schedule(cronExpression, async () => {
        try {
          await this.executeSubscription(schedule.id);
        } catch (error) {
          logger.error('Cron job execution failed', {
            subscriptionId: schedule.id,
            error: error.message
          });
        }
      }, {
        timezone: schedule.timezone
      });

      this.activeSubscriptions.set(schedule.id, task);

      logger.info('Cron job setup', {
        subscriptionId: schedule.id,
        cronExpression
      });
    } catch (error) {
      logger.error('Failed to setup cron job', {
        subscriptionId: schedule.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Cancel cron job
   */
  cancelCronJob(subscriptionId) {
    const task = this.activeSubscriptions.get(subscriptionId);
    if (task) {
      task.stop();
      this.activeSubscriptions.delete(subscriptionId);

      logger.info('Cron job cancelled', { subscriptionId });
    }
  }

  /**
   * Get cron expression from schedule
   */
  getCronExpression(schedule) {
    const [hour, minute] = (schedule.runAt || '09:00:00').split(':');

    switch (schedule.frequency) {
      case 'daily':
        return `${minute} ${hour} * * *`;

      case 'weekly':
        return `${minute} ${hour} * * ${schedule.dayOfWeek || 1}`;

      case 'monthly':
        return `${minute} ${hour} ${schedule.dayOfMonth || 1} * *`;

      case 'quarterly':
        return `${minute} ${hour} 1 */3 *`;

      case 'yearly':
        return `${minute} ${hour} 1 1 *`;

      default:
        return `0 9 * * 1`; // Default: Monday at 9 AM
    }
  }

  /**
   * Evaluate conditional delivery conditions
   */
  evaluateConditions(reportResult, conditions) {
    try {
      if (!conditions || conditions.length === 0) {
        return true;
      }

      // All conditions must be met
      return conditions.every(condition => {
        const { field, operator, value } = condition;

        const fieldValue = this.getNestedValue(reportResult, field);

        switch (operator) {
          case 'gt':
            return fieldValue > value;
          case 'gte':
            return fieldValue >= value;
          case 'lt':
            return fieldValue < value;
          case 'lte':
            return fieldValue <= value;
          case 'eq':
            return fieldValue == value;
          case 'neq':
            return fieldValue != value;
          default:
            return true;
        }
      });
    } catch (error) {
      logger.error('Failed to evaluate conditions', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get nested value from object
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Initialize subscription service
   */
  async initialize() {
    try {
      // Load all active subscriptions and set up cron jobs
      const activeSchedules = await ReportSchedule.findAll({
        where: { isActive: true },
        include: ['report']
      });

      for (const schedule of activeSchedules) {
        await this.setupCronJob(schedule);
      }

      logger.info('Subscription service initialized', {
        activeSubscriptions: activeSchedules.length
      });
    } catch (error) {
      logger.error('Failed to initialize subscription service', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Shutdown subscription service
   */
  shutdown() {
    this.activeSubscriptions.forEach((task, subscriptionId) => {
      task.stop();
    });
    this.activeSubscriptions.clear();

    logger.info('Subscription service shutdown');
  }
}

module.exports = new ReportSubscriptionService();
