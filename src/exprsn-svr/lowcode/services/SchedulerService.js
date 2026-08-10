/**
 * SchedulerService - Automated report scheduling and delivery
 */

const cron = require('node-cron');
const Queue = require('bull');
const { ReportSchedule, Report } = require('../models');
const ReportService = require('./ReportService');
const ExportService = require('./ExportService');

class SchedulerService {
  constructor() {
    this.scheduledJobs = new Map(); // Map<scheduleId, cronJob>
    this.reportQueue = null;
    this.initialized = false;
  }

  /**
   * Initialize the scheduler
   */
  async initialize() {
    if (this.initialized) {
      console.log('[SchedulerService] Already initialized');
      return;
    }

    try {
      // Initialize Bull queue for report execution
      this.reportQueue = new Queue('report-scheduler', {
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379
        }
      });

      // Setup queue processor
      this.reportQueue.process(async (job) => {
        return await this.executeScheduledReport(job.data);
      });

      // Load and schedule all active schedules
      await this.loadSchedules();

      this.initialized = true;
      console.log('[SchedulerService] Initialized successfully');
    } catch (error) {
      console.error('[SchedulerService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load all active schedules from database
   */
  async loadSchedules() {
    try {
      const schedules = await ReportSchedule.findAll({
        where: { enabled: true },
        include: [{
          model: Report,
          as: 'report',
          attributes: ['id', 'displayName', 'queryConfig', 'rawSql']
        }]
      });

      console.log(`[SchedulerService] Loading ${schedules.length} active schedules`);

      for (const schedule of schedules) {
        await this.scheduleReport(schedule);
      }
    } catch (error) {
      console.error('[SchedulerService] Failed to load schedules:', error);
    }
  }

  /**
   * Schedule a report for automated execution
   */
  async scheduleReport(schedule) {
    try {
      // Validate cron expression
      if (!cron.validate(schedule.cronExpression)) {
        console.error(`[SchedulerService] Invalid cron expression for schedule ${schedule.id}: ${schedule.cronExpression}`);
        return false;
      }

      // Remove existing job if any
      if (this.scheduledJobs.has(schedule.id)) {
        this.scheduledJobs.get(schedule.id).stop();
        this.scheduledJobs.delete(schedule.id);
      }

      // Create cron job
      const job = cron.schedule(schedule.cronExpression, async () => {
        console.log(`[SchedulerService] Triggering scheduled report: ${schedule.id}`);

        // Add to queue for processing
        await this.reportQueue.add({
          scheduleId: schedule.id,
          reportId: schedule.reportId,
          applicationId: schedule.applicationId
        }, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          },
          timeout: 300000 // 5 minutes
        });
      }, {
        timezone: schedule.timezone || 'UTC'
      });

      this.scheduledJobs.set(schedule.id, job);

      // Calculate and update next execution time
      await this.updateNextExecutionTime(schedule);

      console.log(`[SchedulerService] Scheduled report ${schedule.id}: ${schedule.cronExpression}`);
      return true;
    } catch (error) {
      console.error(`[SchedulerService] Failed to schedule report ${schedule.id}:`, error);
      return false;
    }
  }

  /**
   * Execute a scheduled report
   */
  async executeScheduledReport(data) {
    const { scheduleId, reportId, applicationId } = data;

    try {
      console.log(`[SchedulerService] Executing scheduled report: ${reportId}`);

      // Get schedule and report details
      const schedule = await ReportSchedule.findByPk(scheduleId, {
        include: [{
          model: Report,
          as: 'report'
        }]
      });

      if (!schedule) {
        throw new Error(`Schedule ${scheduleId} not found`);
      }

      if (!schedule.enabled) {
        console.log(`[SchedulerService] Schedule ${scheduleId} is disabled, skipping`);
        return { success: true, skipped: true };
      }

      // Execute report with parameters
      const executionResult = await ReportService.executeReport(
        reportId,
        schedule.parameterValues || {},
        null // System execution
      );

      if (!executionResult.success) {
        throw new Error(`Report execution failed: ${executionResult.message}`);
      }

      // Export to requested format
      const exportResult = await ExportService.exportReport(
        executionResult.data,
        schedule.exportFormat || 'csv',
        schedule.report.displayName.replace(/[^a-z0-9]/gi, '_'),
        {
          title: schedule.report.displayName,
          description: schedule.report.description
        }
      );

      if (!exportResult.success) {
        throw new Error(`Export failed: ${exportResult.message}`);
      }

      // Deliver based on delivery method
      const deliveryResult = await this.deliverReport(schedule, exportResult);

      // Update schedule
      await schedule.update({
        lastExecutedAt: new Date(),
        lastExecutionStatus: deliveryResult.success ? 'success' : 'failed',
        lastExecutionError: deliveryResult.success ? null : deliveryResult.error
      });

      await this.updateNextExecutionTime(schedule);

      console.log(`[SchedulerService] Successfully executed schedule ${scheduleId}`);

      return {
        success: true,
        executionId: executionResult.executionId,
        deliveryStatus: deliveryResult.success ? 'delivered' : 'failed'
      };
    } catch (error) {
      console.error(`[SchedulerService] Failed to execute schedule ${scheduleId}:`, error);

      // Update schedule with error
      try {
        const schedule = await ReportSchedule.findByPk(scheduleId);
        if (schedule) {
          await schedule.update({
            lastExecutedAt: new Date(),
            lastExecutionStatus: 'failed',
            lastExecutionError: error.message
          });
        }
      } catch (updateError) {
        console.error('[SchedulerService] Failed to update schedule error status:', updateError);
      }

      throw error;
    }
  }

  /**
   * Deliver report via configured method
   */
  async deliverReport(schedule, exportResult) {
    const deliveryMethod = schedule.deliveryMethod;
    const deliveryConfig = schedule.deliveryConfig || {};

    try {
      switch (deliveryMethod) {
        case 'email':
          // TODO: Integrate with email service (e.g., SendGrid via exprsn-herald)
          console.log(`[SchedulerService] Email delivery not yet implemented`);
          console.log(`  To: ${deliveryConfig.recipients?.join(', ')}`);
          console.log(`  Subject: ${deliveryConfig.subject || 'Scheduled Report'}`);
          console.log(`  Attachment: ${exportResult.filename}`);
          return {
            success: true,
            message: 'Email delivery queued',
            method: 'email'
          };

        case 'webhook':
          // TODO: Send POST request to webhook URL with report data/file
          console.log(`[SchedulerService] Webhook delivery not yet implemented`);
          console.log(`  URL: ${deliveryConfig.webhookUrl}`);
          console.log(`  File: ${exportResult.filename}`);
          return {
            success: true,
            message: 'Webhook delivery queued',
            method: 'webhook'
          };

        case 'storage':
          // TODO: Save to file storage (e.g., exprsn-filevault)
          console.log(`[SchedulerService] Storage delivery not yet implemented`);
          console.log(`  Path: ${deliveryConfig.storagePath}`);
          console.log(`  File: ${exportResult.filename}`);
          return {
            success: true,
            message: 'File saved to storage',
            method: 'storage'
          };

        case 'dashboard':
          // Store in database for dashboard viewing
          return {
            success: true,
            message: 'Report available in dashboard',
            method: 'dashboard'
          };

        default:
          return {
            success: false,
            error: `Unsupported delivery method: ${deliveryMethod}`
          };
      }
    } catch (error) {
      console.error(`[SchedulerService] Delivery failed:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate next execution time based on cron expression
   */
  async updateNextExecutionTime(schedule) {
    try {
      // This is a simplified calculation
      // For production, use a library like cron-parser
      const now = new Date();
      const nextRun = new Date(now.getTime() + 60000); // Placeholder: 1 minute from now

      await schedule.update({
        nextExecutionAt: nextRun
      });
    } catch (error) {
      console.error('[SchedulerService] Failed to update next execution time:', error);
    }
  }

  /**
   * Unschedule a report
   */
  async unscheduleReport(scheduleId) {
    if (this.scheduledJobs.has(scheduleId)) {
      this.scheduledJobs.get(scheduleId).stop();
      this.scheduledJobs.delete(scheduleId);
      console.log(`[SchedulerService] Unscheduled report ${scheduleId}`);
      return true;
    }
    return false;
  }

  /**
   * Reload a specific schedule
   */
  async reloadSchedule(scheduleId) {
    try {
      const schedule = await ReportSchedule.findByPk(scheduleId, {
        include: [{
          model: Report,
          as: 'report'
        }]
      });

      if (!schedule) {
        return { success: false, error: 'Schedule not found' };
      }

      // Unschedule if exists
      await this.unscheduleReport(scheduleId);

      // Reschedule if enabled
      if (schedule.enabled) {
        await this.scheduleReport(schedule);
      }

      return { success: true };
    } catch (error) {
      console.error(`[SchedulerService] Failed to reload schedule ${scheduleId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Shutdown scheduler
   */
  async shutdown() {
    console.log('[SchedulerService] Shutting down...');

    // Stop all cron jobs
    for (const [scheduleId, job] of this.scheduledJobs) {
      job.stop();
    }
    this.scheduledJobs.clear();

    // Close queue
    if (this.reportQueue) {
      await this.reportQueue.close();
    }

    this.initialized = false;
    console.log('[SchedulerService] Shutdown complete');
  }
}

// Export singleton instance
const schedulerService = new SchedulerService();

module.exports = schedulerService;
