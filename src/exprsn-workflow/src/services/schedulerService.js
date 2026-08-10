const cron = require('node-cron');
const cronParser = require('cron-parser');
const { Workflow } = require('../models');
const executionEngine = require('./executionEngine');
const auditService = require('./auditService');
const logger = require('../utils/logger');

/**
 * Scheduler Service
 * Manages scheduled workflow executions using cron expressions
 */
class SchedulerService {
  constructor() {
    this.scheduledTasks = new Map(); // workflowId -> cron task
    this.initialized = false;
  }

  /**
   * Initialize scheduler - load all scheduled workflows
   */
  async initialize() {
    if (this.initialized) {
      logger.warn('Scheduler already initialized');
      return;
    }

    try {
      logger.info('Initializing workflow scheduler');

      // Find all active scheduled workflows
      const workflows = await Workflow.findAll({
        where: {
          trigger_type: 'scheduled',
          status: 'active'
        }
      });

      logger.info(`Found ${workflows.length} scheduled workflows`);

      // Schedule each workflow
      for (const workflow of workflows) {
        try {
          await this.scheduleWorkflow(workflow.id);
        } catch (error) {
          logger.error(`Failed to schedule workflow ${workflow.id}`, {
            error: error.message,
            workflowId: workflow.id
          });
        }
      }

      this.initialized = true;
      logger.info('Workflow scheduler initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize scheduler', { error: error.message });
      throw error;
    }
  }

  /**
   * Schedule a workflow
   */
  async scheduleWorkflow(workflowId) {
    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    if (workflow.trigger_type !== 'scheduled') {
      throw new Error('Workflow is not configured for scheduled execution');
    }

    if (!workflow.trigger_config?.schedule) {
      throw new Error('Workflow schedule configuration is missing');
    }

    const { schedule, timezone = 'UTC', enabled = true, inputData = {} } = workflow.trigger_config;

    // Validate cron expression
    if (!this.validateCronExpression(schedule)) {
      throw new Error('Invalid cron expression');
    }

    // Stop existing schedule if any
    this.unscheduleWorkflow(workflowId);

    if (!enabled) {
      logger.info('Workflow schedule is disabled', { workflowId });
      return;
    }

    // Create cron task
    const task = cron.schedule(
      schedule,
      async () => {
        try {
          logger.info('Executing scheduled workflow', {
            workflowId,
            schedule,
            timezone
          });

          // Start execution
          const execution = await executionEngine.startExecution(
            workflowId,
            inputData,
            null, // System-initiated
            {
              triggerType: 'scheduled',
              triggerData: {
                schedule,
                timezone,
                executedAt: new Date().toISOString()
              }
            }
          );

          // Log audit event
          await auditService.log({
            eventType: 'execution_start',
            workflowId,
            executionId: execution.id,
            userId: null,
            success: true,
            metadata: {
              trigger: 'scheduled',
              schedule,
              timezone
            }
          });

          logger.info('Scheduled workflow execution started', {
            workflowId,
            executionId: execution.id
          });
        } catch (error) {
          logger.error('Scheduled workflow execution failed', {
            workflowId,
            error: error.message
          });

          // Log audit event for failure
          await auditService.log({
            eventType: 'execution_start',
            workflowId,
            userId: null,
            success: false,
            errorMessage: error.message,
            severity: 'error',
            metadata: {
              trigger: 'scheduled',
              schedule,
              timezone
            }
          });
        }
      },
      {
        scheduled: true,
        timezone
      }
    );

    this.scheduledTasks.set(workflowId, task);

    logger.info('Workflow scheduled successfully', {
      workflowId,
      schedule,
      timezone
    });

    return {
      workflowId,
      schedule,
      timezone,
      enabled,
      nextExecution: this.getNextExecution(schedule, timezone)
    };
  }

  /**
   * Unschedule a workflow
   */
  unscheduleWorkflow(workflowId) {
    const task = this.scheduledTasks.get(workflowId);

    if (task) {
      task.stop();
      this.scheduledTasks.delete(workflowId);
      logger.info('Workflow unscheduled', { workflowId });
      return true;
    }

    return false;
  }

  /**
   * Update workflow schedule
   */
  async updateSchedule(workflowId, scheduleConfig) {
    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Validate cron expression
    if (scheduleConfig.schedule && !this.validateCronExpression(scheduleConfig.schedule)) {
      throw new Error('Invalid cron expression');
    }

    // Update trigger config
    const newTriggerConfig = {
      ...workflow.trigger_config,
      ...scheduleConfig
    };

    await workflow.update({
      trigger_type: 'scheduled',
      trigger_config: newTriggerConfig
    });

    // Reschedule
    if (scheduleConfig.enabled !== false && workflow.status === 'active') {
      await this.scheduleWorkflow(workflowId);
    } else {
      this.unscheduleWorkflow(workflowId);
    }

    // Log audit event
    await auditService.logWorkflowUpdate(workflow, { trigger_config: newTriggerConfig }, null);

    logger.info('Workflow schedule updated', {
      workflowId,
      schedule: scheduleConfig.schedule
    });

    return workflow;
  }

  /**
   * Enable schedule for a workflow
   */
  async enableSchedule(workflowId) {
    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    if (workflow.trigger_type !== 'scheduled') {
      throw new Error('Workflow is not configured for scheduled execution');
    }

    const triggerConfig = {
      ...workflow.trigger_config,
      enabled: true
    };

    await workflow.update({ trigger_config: triggerConfig });

    // Schedule the workflow
    if (workflow.status === 'active') {
      await this.scheduleWorkflow(workflowId);
    }

    logger.info('Workflow schedule enabled', { workflowId });

    return workflow;
  }

  /**
   * Disable schedule for a workflow
   */
  async disableSchedule(workflowId) {
    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const triggerConfig = {
      ...workflow.trigger_config,
      enabled: false
    };

    await workflow.update({ trigger_config: triggerConfig });

    // Unschedule the workflow
    this.unscheduleWorkflow(workflowId);

    logger.info('Workflow schedule disabled', { workflowId });

    return workflow;
  }

  /**
   * Get schedule info for a workflow
   */
  async getScheduleInfo(workflowId) {
    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    if (workflow.trigger_type !== 'scheduled') {
      return {
        scheduled: false,
        message: 'Workflow is not configured for scheduled execution'
      };
    }

    const { schedule, timezone = 'UTC', enabled = true, inputData = {} } = workflow.trigger_config || {};

    if (!schedule) {
      return {
        scheduled: false,
        message: 'Schedule configuration is missing'
      };
    }

    const isRunning = this.scheduledTasks.has(workflowId);

    return {
      scheduled: true,
      running: isRunning,
      schedule,
      timezone,
      enabled,
      inputData,
      nextExecution: this.getNextExecution(schedule, timezone),
      nextExecutions: this.getNextExecutions(schedule, timezone, 5),
      description: this.describeCronExpression(schedule)
    };
  }

  /**
   * Get all scheduled workflows
   */
  async getAllScheduled() {
    const workflows = await Workflow.findAll({
      where: {
        trigger_type: 'scheduled'
      },
      attributes: ['id', 'name', 'status', 'trigger_config']
    });

    const scheduled = [];

    for (const workflow of workflows) {
      const { schedule, timezone = 'UTC', enabled = true } = workflow.trigger_config || {};

      if (schedule) {
        scheduled.push({
          workflowId: workflow.id,
          workflowName: workflow.name,
          workflowStatus: workflow.status,
          schedule,
          timezone,
          enabled,
          running: this.scheduledTasks.has(workflow.id),
          nextExecution: this.getNextExecution(schedule, timezone),
          description: this.describeCronExpression(schedule)
        });
      }
    }

    return scheduled;
  }

  /**
   * Validate cron expression
   */
  validateCronExpression(expression) {
    try {
      // Validate with both node-cron and cron-parser
      const isValidNodeCron = cron.validate(expression);

      if (!isValidNodeCron) {
        return false;
      }

      // Additional validation with cron-parser
      cronParser.parseExpression(expression);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get next execution time
   */
  getNextExecution(schedule, timezone = 'UTC') {
    try {
      const interval = cronParser.parseExpression(schedule, {
        currentDate: new Date(),
        tz: timezone
      });
      return interval.next().toDate();
    } catch (error) {
      logger.error('Failed to calculate next execution', { error: error.message });
      return null;
    }
  }

  /**
   * Get next N execution times
   */
  getNextExecutions(schedule, timezone = 'UTC', count = 5) {
    try {
      const interval = cronParser.parseExpression(schedule, {
        currentDate: new Date(),
        tz: timezone
      });

      const executions = [];
      for (let i = 0; i < count; i++) {
        executions.push(interval.next().toDate());
      }
      return executions;
    } catch (error) {
      logger.error('Failed to calculate next executions', { error: error.message });
      return [];
    }
  }

  /**
   * Describe cron expression in human-readable format
   */
  describeCronExpression(expression) {
    try {
      const parts = expression.split(' ');

      if (parts.length < 5) {
        return 'Invalid cron expression';
      }

      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

      // Common patterns
      if (expression === '* * * * *') return 'Every minute';
      if (expression === '0 * * * *') return 'Every hour';
      if (expression === '0 0 * * *') return 'Daily at midnight';
      if (expression === '0 0 * * 0') return 'Weekly on Sunday at midnight';
      if (expression === '0 0 1 * *') return 'Monthly on the 1st at midnight';
      if (expression === '0 9 * * 1-5') return 'Weekdays at 9:00 AM';
      if (expression === '*/5 * * * *') return 'Every 5 minutes';
      if (expression === '*/15 * * * *') return 'Every 15 minutes';
      if (expression === '*/30 * * * *') return 'Every 30 minutes';
      if (expression === '0 */2 * * *') return 'Every 2 hours';
      if (expression === '0 */6 * * *') return 'Every 6 hours';

      // Build description
      let description = 'At ';

      if (minute === '*') {
        description += 'every minute';
      } else if (minute.startsWith('*/')) {
        description += `every ${minute.substring(2)} minutes`;
      } else {
        description += `minute ${minute}`;
      }

      if (hour !== '*') {
        if (hour.startsWith('*/')) {
          description += `, every ${hour.substring(2)} hours`;
        } else {
          description += `, hour ${hour}`;
        }
      }

      if (dayOfMonth !== '*') {
        description += `, day ${dayOfMonth}`;
      }

      if (month !== '*') {
        description += `, month ${month}`;
      }

      if (dayOfWeek !== '*') {
        description += `, day of week ${dayOfWeek}`;
      }

      return description;
    } catch (error) {
      return 'Custom schedule';
    }
  }

  /**
   * Trigger a scheduled workflow manually (for testing)
   */
  async triggerNow(workflowId, userId = null) {
    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    if (workflow.trigger_type !== 'scheduled') {
      throw new Error('Workflow is not configured for scheduled execution');
    }

    const { inputData = {} } = workflow.trigger_config || {};

    const execution = await executionEngine.startExecution(
      workflowId,
      inputData,
      userId,
      {
        triggerType: 'manual',
        triggerData: {
          manual: true,
          message: 'Manually triggered scheduled workflow'
        }
      }
    );

    logger.info('Scheduled workflow triggered manually', {
      workflowId,
      executionId: execution.id,
      userId
    });

    return execution;
  }

  /**
   * Shutdown scheduler
   */
  shutdown() {
    logger.info('Shutting down scheduler');

    for (const [workflowId, task] of this.scheduledTasks.entries()) {
      task.stop();
      logger.info('Stopped scheduled task', { workflowId });
    }

    this.scheduledTasks.clear();
    this.initialized = false;

    logger.info('Scheduler shutdown complete');
  }
}

module.exports = new SchedulerService();
