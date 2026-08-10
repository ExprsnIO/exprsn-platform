/**
 * Schedule Service
 * Manages scheduled report executions
 */

const cron = require('node-cron');
const { Schedule, ScheduleExecution, Report } = require('../models');
const ReportService = require('./ReportService');
const logger = require('../utils/logger');
const nodemailer = require('nodemailer');
const axios = require('axios');

class ScheduleService {
  constructor() {
    this.activeCrons = new Map();
    this.emailTransporter = null;
  }

  /**
   * Initialize email transporter
   */
  _initializeEmailTransporter() {
    if (this.emailTransporter) return;

    this.emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      } : undefined
    });
  }

  /**
   * Create a new schedule
   */
  async create(data, userId) {
    try {
      // Validate cron expression
      if (!cron.validate(data.cronExpression)) {
        throw new Error('Invalid cron expression');
      }

      // Validate report exists
      const report = await Report.findByPk(data.reportId);
      if (!report) {
        throw new Error('Report not found');
      }

      const schedule = await Schedule.create({
        ...data,
        createdBy: userId
      });

      // Calculate next execution time
      await this._updateNextExecution(schedule);

      // Start cron job if active
      if (schedule.isActive) {
        this.startCron(schedule.id);
      }

      logger.info('Schedule created', {
        scheduleId: schedule.id,
        reportId: data.reportId,
        cronExpression: data.cronExpression
      });

      return schedule;
    } catch (error) {
      logger.error('Failed to create schedule', { error: error.message });
      throw error;
    }
  }

  /**
   * Start cron job for schedule
   */
  startCron(scheduleId) {
    // Stop existing cron if running
    this.stopCron(scheduleId);

    Schedule.findByPk(scheduleId).then(schedule => {
      if (!schedule || !schedule.isActive) {
        return;
      }

      const task = cron.schedule(schedule.cronExpression, async () => {
        await this.executeSchedule(schedule.id);
      }, {
        timezone: schedule.timezone
      });

      this.activeCrons.set(scheduleId, task);

      logger.info('Cron job started', {
        scheduleId,
        cronExpression: schedule.cronExpression,
        timezone: schedule.timezone
      });
    });
  }

  /**
   * Stop cron job for schedule
   */
  stopCron(scheduleId) {
    const task = this.activeCrons.get(scheduleId);
    if (task) {
      task.stop();
      this.activeCrons.delete(scheduleId);
      logger.info('Cron job stopped', { scheduleId });
    }
  }

  /**
   * Execute a scheduled report
   */
  async executeSchedule(scheduleId) {
    const schedule = await Schedule.findByPk(scheduleId, {
      include: [{ model: Report, as: 'report' }]
    });

    if (!schedule) {
      logger.error('Schedule not found', { scheduleId });
      return;
    }

    // Create execution record
    const execution = await ScheduleExecution.create({
      scheduleId,
      status: 'pending',
      parameters: schedule.parameters
    });

    const startTime = Date.now();

    try {
      // Update execution status
      await execution.update({
        status: 'running',
        startedAt: new Date()
      });

      // Execute report
      const result = await ReportService.execute(
        schedule.reportId,
        schedule.parameters,
        { format: schedule.format }
      );

      const duration = Date.now() - startTime;

      // Save report output
      const resultUrl = await this._saveReportOutput(schedule, execution, result);

      // Update execution record
      await execution.update({
        status: 'success',
        completedAt: new Date(),
        duration,
        resultSize: Buffer.byteLength(result.output),
        resultUrl
      });

      // Deliver report
      const deliveryStatus = await this._deliverReport(schedule, result, resultUrl);

      await execution.update({ deliveryStatus });

      // Update schedule statistics
      await schedule.update({
        lastExecutedAt: new Date(),
        executionCount: schedule.executionCount + 1
      });

      await this._updateNextExecution(schedule);

      logger.info('Scheduled report executed successfully', {
        scheduleId,
        executionId: execution.id,
        duration,
        deliveryMethod: schedule.deliveryMethod
      });
    } catch (error) {
      logger.error('Scheduled report execution failed', {
        scheduleId,
        executionId: execution.id,
        error: error.message,
        stack: error.stack
      });

      await execution.update({
        status: 'failed',
        completedAt: new Date(),
        duration: Date.now() - startTime,
        error: error.message,
        errorStack: error.stack
      });

      await schedule.increment('failureCount');
    }
  }

  /**
   * Save report output to storage
   */
  async _saveReportOutput(schedule, execution, result) {
    // TODO: Implement file storage (S3, local filesystem, etc.)
    // For now, return a placeholder URL
    const filename = `report_${schedule.reportId}_${execution.id}.${schedule.format}`;
    const storagePath = `/reports/${filename}`;

    // In production, save to S3 or configured storage
    logger.debug('Report output saved', { storagePath });

    return storagePath;
  }

  /**
   * Deliver report via configured method
   */
  async _deliverReport(schedule, result, resultUrl) {
    const status = {};

    if (schedule.deliveryMethod === 'email' || schedule.deliveryMethod === 'both') {
      status.email = await this._sendEmail(schedule, result, resultUrl);
    }

    if (schedule.deliveryMethod === 'webhook' || schedule.deliveryMethod === 'both') {
      status.webhook = await this._sendWebhook(schedule, result, resultUrl);
    }

    if (schedule.deliveryMethod === 's3') {
      status.s3 = await this._uploadToS3(schedule, result);
    }

    return status;
  }

  /**
   * Send report via email
   */
  async _sendEmail(schedule, result, resultUrl) {
    this._initializeEmailTransporter();

    try {
      const attachments = [{
        filename: `report.${schedule.format}`,
        content: result.output
      }];

      const subject = schedule.emailSubject || `Scheduled Report: ${result.name}`;
      const body = schedule.emailBody || `
        <h2>${result.name}</h2>
        <p>Generated at: ${result.generatedAt}</p>
        <p>Execution time: ${result.executionTime}ms</p>
        <p>Please find the attached report.</p>
      `;

      const info = await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@exprsn.com',
        to: schedule.recipients.join(', '),
        subject,
        html: body,
        attachments
      });

      logger.info('Report email sent', {
        scheduleId: schedule.id,
        messageId: info.messageId,
        recipients: schedule.recipients
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('Failed to send report email', {
        scheduleId: schedule.id,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Send report to webhook
   */
  async _sendWebhook(schedule, result, resultUrl) {
    try {
      const response = await axios.post(schedule.webhookUrl, {
        scheduleId: schedule.id,
        reportId: schedule.reportId,
        reportName: result.name,
        generatedAt: result.generatedAt,
        format: schedule.format,
        url: resultUrl,
        executionTime: result.executionTime
      }, {
        timeout: 10000
      });

      logger.info('Webhook sent', {
        scheduleId: schedule.id,
        url: schedule.webhookUrl,
        status: response.status
      });

      return { success: true, statusCode: response.status };
    } catch (error) {
      logger.error('Failed to send webhook', {
        scheduleId: schedule.id,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Upload report to S3
   */
  async _uploadToS3(schedule, result) {
    // TODO: Implement S3 upload
    // For now, return placeholder
    logger.debug('S3 upload not yet implemented');

    return { success: false, error: 'Not implemented' };
  }

  /**
   * Update next execution time for schedule
   */
  async _updateNextExecution(schedule) {
    // Parse cron expression and calculate next run
    // This is a simplified calculation - in production use a robust cron parser
    const now = new Date();
    const nextRun = new Date(now.getTime() + 60000); // Placeholder: 1 minute from now

    await schedule.update({ nextExecutionAt: nextRun });
  }

  /**
   * Get schedule by ID
   */
  async getById(id) {
    return await Schedule.findByPk(id, {
      include: [
        { model: Report, as: 'report' },
        { model: ScheduleExecution, as: 'executions', limit: 10, order: [['createdAt', 'DESC']] }
      ]
    });
  }

  /**
   * List schedules
   */
  async list(filters = {}) {
    const where = {};

    if (filters.reportId) where.reportId = filters.reportId;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;

    return await Schedule.findAll({
      where,
      order: [['nextExecutionAt', 'ASC']],
      include: [{ model: Report, as: 'report' }]
    });
  }

  /**
   * Update schedule
   */
  async update(id, data, userId) {
    const schedule = await Schedule.findByPk(id);
    if (!schedule) {
      throw new Error('Schedule not found');
    }

    const wasActive = schedule.isActive;

    await schedule.update({
      ...data,
      updatedBy: userId
    });

    // Restart cron if active or activation status changed
    if (schedule.isActive) {
      this.startCron(id);
    } else if (wasActive && !schedule.isActive) {
      this.stopCron(id);
    }

    return schedule;
  }

  /**
   * Delete schedule
   */
  async delete(id) {
    this.stopCron(id);

    const schedule = await Schedule.findByPk(id);
    if (!schedule) {
      throw new Error('Schedule not found');
    }

    await schedule.destroy();
    logger.info('Schedule deleted', { scheduleId: id });
  }

  /**
   * Initialize all active schedules on service startup
   */
  async initializeAll() {
    const activeSchedules = await Schedule.findAll({
      where: { isActive: true }
    });

    for (const schedule of activeSchedules) {
      this.startCron(schedule.id);
    }

    logger.info('Initialized schedules', { count: activeSchedules.length });
  }

  /**
   * Stop all cron jobs
   */
  stopAll() {
    for (const [scheduleId, task] of this.activeCrons.entries()) {
      task.stop();
    }
    this.activeCrons.clear();
    logger.info('All cron jobs stopped');
  }
}

module.exports = new ScheduleService();
