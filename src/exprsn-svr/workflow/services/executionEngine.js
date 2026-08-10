const { WorkflowExecution, WorkflowLog, Workflow, WorkflowStep } = require('../models');
const vmExecutor = require('./vmExecutor');
const logger = require('../utils/logger');
const { Parser } = require('expr-eval');
const axios = require('axios');
const lowcodeService = require('./lowcodeService');

class ExecutionEngine {
  constructor() {
    this.activeExecutions = new Map();
    this.parser = new Parser();
  }

  /**
   * Start workflow execution
   */
  async startExecution(workflowId, inputData = {}, userId = null, options = {}) {
    try {
      // Get workflow
      const workflow = await Workflow.findByPk(workflowId, {
        include: [
          {
            model: WorkflowStep,
            as: 'steps',
            order: [['order', 'ASC']]
          }
        ]
      });

      if (!workflow) {
        throw new Error('Workflow not found');
      }

      if (workflow.status !== 'active') {
        throw new Error('Workflow is not active');
      }

      // Create execution record
      const execution = await WorkflowExecution.create({
        workflow_id: workflowId,
        workflow_version: workflow.version,
        status: 'pending',
        trigger_type: options.triggerType || 'manual',
        trigger_data: options.triggerData || {},
        input_data: inputData,
        context: {
          variables: { ...workflow.variables, ...inputData },
          flags: {},
          startTime: Date.now()
        },
        initiated_by: userId,
        parent_execution_id: options.parentExecutionId,
        priority: options.priority || 5
      });

      // Start execution in background
      this.executeWorkflow(execution.id).catch(error => {
        logger.error('Workflow execution failed', {
          executionId: execution.id,
          error: error.message
        });
      });

      return execution;
    } catch (error) {
      logger.error('Failed to start workflow execution', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute workflow
   */
  async executeWorkflow(executionId) {
    let execution = await WorkflowExecution.findByPk(executionId, {
      include: [
        {
          model: Workflow,
          as: 'workflow',
          include: [
            {
              model: WorkflowStep,
              as: 'steps',
              order: [['order', 'ASC']]
            }
          ]
        }
      ]
    });

    if (!execution) {
      throw new Error('Execution not found');
    }

    try {
      // Update status to running
      await execution.update({
        status: 'running',
        started_at: new Date()
      });

      // Emit to monitoring
      if (global.io) global.io.emit('execution:update', execution);

      this.activeExecutions.set(executionId, execution);

      await this.log(executionId, 'info', 'Workflow execution started', null);

      // Get workflow definition
      const workflow = execution.workflow;
      const steps = workflow.steps;

      // Find starting step (trigger step or first step)
      let currentStepId = steps.find(s => s.step_type === 'trigger')?.step_id || steps[0]?.step_id;

      let iterationCount = 0;
      const maxIterations = workflow.settings?.maxIterations || 1000;
      const maxExecutionTime = workflow.settings?.maxExecutionTime || 300000;
      const startTime = Date.now();

      // Execute steps
      while (currentStepId) {
        // Check iteration limit
        if (++iterationCount > maxIterations) {
          throw new Error('Maximum iteration count exceeded');
        }

        // Check execution time limit
        if (Date.now() - startTime > maxExecutionTime) {
          throw new Error('Maximum execution time exceeded');
        }

        // Get current step
        const step = steps.find(s => s.step_id === currentStepId);
        if (!step) {
          throw new Error(`Step not found: ${currentStepId}`);
        }

        // Skip disabled steps
        if (!step.is_enabled) {
          await this.log(executionId, 'info', `Skipping disabled step: ${step.name}`, step.step_id);
          currentStepId = this.getNextStep(step, execution.context);
          continue;
        }

        // Update current step
        await execution.update({ current_step_id: currentStepId });

        await this.log(executionId, 'info', `Executing step: ${step.name}`, step.step_id);

        // Execute step
        const stepStartTime = Date.now();
        const stepResult = await this.executeStep(step, execution);
        const stepDuration = Date.now() - stepStartTime;

        // Store step result
        const stepResults = execution.step_results || {};
        stepResults[currentStepId] = stepResult;

        // Update execution with step result
        await execution.update({
          step_results: stepResults,
          context: execution.context
        });

        // Emit progress to monitoring
        if (global.io) global.io.emit('execution:update', { id: execution.id, current_step_id: currentStepId, completed_steps: execution.completed_steps });

        // Check if step should pause execution (e.g., approval step)
        if (stepResult.shouldPause) {
          await this.log(
            executionId,
            'info',
            `Execution paused at step: ${step.name}`,
            step.step_id,
            { reason: stepResult.error }
          );
          // Exit execution loop - will resume when approved
          this.activeExecutions.delete(executionId);
          return execution;
        }

        // Check step result
        if (stepResult.success) {
          // Add to completed steps
          await execution.update({
            completed_steps: [...execution.completed_steps, currentStepId]
          });

          await this.log(
            executionId,
            'info',
            `Step completed: ${step.name}`,
            step.step_id,
            { duration: stepDuration, result: stepResult.data }
          );

          // Determine next step
          currentStepId = this.getNextStep(step, execution.context, stepResult);
        } else {
          // Step failed
          await execution.update({
            failed_steps: [...execution.failed_steps, currentStepId]
          });

          await this.log(
            executionId,
            'error',
            `Step failed: ${step.name} - ${stepResult.error}`,
            step.step_id,
            { error: stepResult.error }
          );

          // Handle error
          if (step.error_handler) {
            const shouldContinue = await this.handleStepError(step, stepResult, execution);
            if (!shouldContinue) {
              throw new Error(`Step failed: ${step.name}`);
            }
            currentStepId = step.error_handler.nextStep || null;
          } else {
            throw new Error(`Step failed: ${step.name}`);
          }
        }

        // Reload execution to get latest data
        execution = await WorkflowExecution.findByPk(executionId, {
          include: [
            {
              model: Workflow,
              as: 'workflow',
              include: [
                {
                  model: WorkflowStep,
                  as: 'steps'
                }
              ]
            }
          ]
        });
      }

      // Execution completed
      const duration = Date.now() - startTime;

      await execution.update({
        status: 'completed',
        completed_at: new Date(),
        duration
      });

      // Emit to monitoring
      if (global.io) global.io.emit('execution:complete', execution);

      // Update workflow statistics
      await workflow.update({
        execution_count: workflow.execution_count + 1,
        success_count: workflow.success_count + 1,
        average_duration: workflow.average_duration
          ? Math.round((workflow.average_duration + duration) / 2)
          : duration,
        last_executed_at: new Date()
      });

      await this.log(executionId, 'info', 'Workflow execution completed', null, { duration });

      this.activeExecutions.delete(executionId);

      return execution;
    } catch (error) {
      const duration = Date.now() - (execution.started_at?.getTime() || Date.now());

      await execution.update({
        status: 'failed',
        completed_at: new Date(),
        duration,
        error: {
          message: error.message,
          stack: error.stack
        }
      });

      // Update workflow statistics
      await execution.workflow.update({
        execution_count: execution.workflow.execution_count + 1,
        failure_count: execution.workflow.failure_count + 1,
        last_executed_at: new Date()
      });

      await this.log(executionId, 'error', `Workflow execution failed: ${error.message}`, null, {
        error: error.message,
        stack: error.stack
      });

      this.activeExecutions.delete(executionId);

      throw error;
    }
  }

  /**
   * Execute individual step
   */
  async executeStep(step, execution) {
    try {
      const context = execution.context;

      switch (step.step_type) {
        case 'action':
          return await this.executeAction(step, context);

        case 'condition':
          return await this.executeCondition(step, context);

        case 'javascript':
          return await this.executeJavaScript(step, context);

        case 'data_transform':
          return await this.executeDataTransform(step, context);

        case 'api_call':
          return await this.executeApiCall(step, context);

        case 'loop':
          return await this.executeLoop(step, context, execution);

        case 'switch':
          return await this.executeSwitch(step, context);

        case 'wait':
          return await this.executeWait(step, context);

        case 'parallel':
          return await this.executeParallel(step, context, execution);

        case 'subworkflow':
          return await this.executeSubworkflow(step, context, execution);

        case 'approval':
          return await this.executeApproval(step, context, execution);

        case 'notification':
          return await this.executeNotification(step, context, execution);

        // Low-Code Platform Integration
        case 'lowcode_create':
          return await this.executeLowCodeCreate(step, context);

        case 'lowcode_read':
          return await this.executeLowCodeRead(step, context);

        case 'lowcode_update':
          return await this.executeLowCodeUpdate(step, context);

        case 'lowcode_delete':
          return await this.executeLowCodeDelete(step, context);

        case 'lowcode_query':
          return await this.executeLowCodeQuery(step, context);

        case 'lowcode_formula':
          return await this.executeLowCodeFormula(step, context);

        default:
          throw new Error(`Unsupported step type: ${step.step_type}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  }

  /**
   * Execute action step
   */
  async executeAction(step, context) {
    const { action, parameters } = step.config;

    // Resolve parameters from context
    const resolvedParams = this.resolveParameters(parameters, context);

    // Execute action (placeholder - extend based on your needs)
    const result = {
      action,
      parameters: resolvedParams,
      executed: true
    };

    // Update context if outputs are defined
    if (step.outputs) {
      for (const [key, value] of Object.entries(step.outputs)) {
        vmExecutor.setNestedValue(context.variables, key, result[value]);
      }
    }

    return {
      success: true,
      data: result
    };
  }

  /**
   * Execute condition step
   */
  async executeCondition(step, context) {
    const { condition } = step.config;

    // Evaluate condition
    const result = await vmExecutor.evaluateCondition(condition, context);

    // Store result in context
    if (step.outputs?.result) {
      vmExecutor.setNestedValue(context.variables, step.outputs.result, result.result);
    }

    return {
      success: true,
      data: { condition: result.result }
    };
  }

  /**
   * Execute JavaScript step
   */
  async executeJavaScript(step, context) {
    const { code } = step.config;

    const result = await vmExecutor.execute(code, context, {
      timeout: step.timeout
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    // Store result in context
    if (step.outputs?.result) {
      vmExecutor.setNestedValue(context.variables, step.outputs.result, result.result);
    }

    return {
      success: true,
      data: result.result
    };
  }

  /**
   * Execute data transform step
   */
  async executeDataTransform(step, context) {
    const { sourceField, targetField, transformCode } = step.config;

    const sourceData = vmExecutor.getNestedValue(context.variables, sourceField);

    const result = await vmExecutor.transform(sourceData, transformCode, {
      timeout: step.timeout
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    // Store result in context
    vmExecutor.setNestedValue(context.variables, targetField, result.data);

    return {
      success: true,
      data: result.data
    };
  }

  /**
   * Execute API call step
   */
  async executeApiCall(step, context) {
    const { method, url, headers, body, responseMapping } = step.config;

    // Resolve URL and parameters
    const resolvedUrl = this.resolveString(url, context);
    const resolvedHeaders = this.resolveParameters(headers || {}, context);
    const resolvedBody = this.resolveParameters(body || {}, context);

    try {
      const response = await axios({
        method: method || 'GET',
        url: resolvedUrl,
        headers: resolvedHeaders,
        data: resolvedBody,
        timeout: step.timeout || 30000
      });

      // Map response to context variables
      if (responseMapping) {
        for (const [targetField, sourcePath] of Object.entries(responseMapping)) {
          const value = sourcePath === '$response'
            ? response.data
            : vmExecutor.getNestedValue(response.data, sourcePath);

          vmExecutor.setNestedValue(context.variables, targetField, value);
        }
      }

      // Store full response if output is defined
      if (step.outputs?.response) {
        vmExecutor.setNestedValue(context.variables, step.outputs.response, response.data);
      }

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      throw new Error(`API call failed: ${error.message}`);
    }
  }

  /**
   * Execute loop step
   */
  async executeLoop(step, context, execution) {
    const { collection, itemVariable, steps: loopSteps } = step.config;

    const items = vmExecutor.getNestedValue(context.variables, collection);

    if (!Array.isArray(items)) {
      throw new Error('Loop collection must be an array');
    }

    const results = [];

    for (let i = 0; i < items.length; i++) {
      // Set loop variables
      context.variables[itemVariable] = items[i];
      context.variables[`${itemVariable}_index`] = i;

      // Execute loop steps
      for (const loopStepId of loopSteps) {
        const loopStep = execution.workflow.steps.find(s => s.step_id === loopStepId);
        if (loopStep) {
          const stepResult = await this.executeStep(loopStep, execution);
          if (!stepResult.success) {
            throw new Error(`Loop step failed: ${loopStep.name}`);
          }
          results.push(stepResult.data);
        }
      }
    }

    // Store results if output is defined
    if (step.outputs?.results) {
      vmExecutor.setNestedValue(context.variables, step.outputs.results, results);
    }

    return {
      success: true,
      data: results
    };
  }

  /**
   * Execute switch step
   */
  async executeSwitch(step, context) {
    const { expression, cases } = step.config;

    // Evaluate expression
    const value = await vmExecutor.executeExpression(expression, context);

    if (!value.success) {
      throw new Error(`Switch expression evaluation failed: ${value.error}`);
    }

    // Find matching case
    const matchedCase = cases.find(c => c.value === value.result) || cases.find(c => c.default);

    return {
      success: true,
      data: {
        value: value.result,
        matchedCase: matchedCase?.name || 'default'
      },
      nextStep: matchedCase?.nextStep
    };
  }

  /**
   * Execute wait step
   */
  async executeWait(step, context) {
    const { duration } = step.config;

    // Resolve duration (can be expression)
    const resolvedDuration = typeof duration === 'string'
      ? this.resolveExpression(duration, context)
      : duration;

    await new Promise(resolve => setTimeout(resolve, resolvedDuration));

    return {
      success: true,
      data: { waited: resolvedDuration }
    };
  }

  /**
   * Execute parallel steps
   */
  async executeParallel(step, context, execution) {
    const { steps: parallelSteps } = step.config;

    const promises = parallelSteps.map(async (stepId) => {
      const parallelStep = execution.workflow.steps.find(s => s.step_id === stepId);
      if (!parallelStep) {
        throw new Error(`Parallel step not found: ${stepId}`);
      }
      return await this.executeStep(parallelStep, execution);
    });

    const results = await Promise.all(promises);

    // Check if any failed
    const failed = results.find(r => !r.success);
    if (failed) {
      throw new Error('One or more parallel steps failed');
    }

    return {
      success: true,
      data: results.map(r => r.data)
    };
  }

  /**
   * Execute subworkflow
   */
  async executeSubworkflow(step, context, execution) {
    const { workflowId, inputMapping } = step.config;

    // Map inputs
    const inputData = this.resolveParameters(inputMapping, context);

    // Start subworkflow execution
    const subExecution = await this.startExecution(
      workflowId,
      inputData,
      execution.initiated_by,
      {
        parentExecutionId: execution.id,
        triggerType: 'subworkflow'
      }
    );

    // Wait for completion (in real implementation, this might be async)
    // For now, we'll return the execution ID

    return {
      success: true,
      data: {
        executionId: subExecution.id
      }
    };
  }

  /**
   * Handle step error
   */
  async handleStepError(step, stepResult, execution) {
    const { retry, fallback, skip } = step.error_handler;

    if (retry && execution.retry_count < (step.retry_config?.maxRetries || 0)) {
      await this.log(execution.id, 'warn', `Retrying step: ${step.name}`, step.step_id);
      await execution.update({ retry_count: execution.retry_count + 1 });

      // Wait before retry
      if (step.retry_config?.retryDelay) {
        await new Promise(resolve => setTimeout(resolve, step.retry_config.retryDelay));
      }

      return true; // Continue with retry
    }

    if (skip) {
      await this.log(execution.id, 'warn', `Skipping failed step: ${step.name}`, step.step_id);
      return true; // Continue to next step
    }

    if (fallback) {
      await this.log(execution.id, 'warn', `Using fallback for step: ${step.name}`, step.step_id);
      // Execute fallback logic
      return true;
    }

    return false; // Stop execution
  }

  /**
   * Determine next step
   */
  getNextStep(step, context, stepResult = null) {
    if (!step.next_steps) {
      return null;
    }

    // If next_steps is a string, return it
    if (typeof step.next_steps === 'string') {
      return step.next_steps;
    }

    // If next_steps is an array, return first element
    if (Array.isArray(step.next_steps)) {
      return step.next_steps[0] || null;
    }

    // If next_steps is an object (conditional branches)
    if (typeof step.next_steps === 'object') {
      // Check if stepResult has nextStep (from switch)
      if (stepResult?.nextStep) {
        return stepResult.nextStep;
      }

      // Evaluate conditions
      for (const [condition, nextStepId] of Object.entries(step.next_steps)) {
        if (condition === 'default') {
          continue;
        }

        try {
          const result = this.parser.evaluate(condition, context.variables);
          if (result) {
            return nextStepId;
          }
        } catch (error) {
          logger.error('Condition evaluation failed', { condition, error: error.message });
        }
      }

      // Return default if no condition matched
      return step.next_steps.default || null;
    }

    return null;
  }

  /**
   * Resolve parameters from context
   */
  resolveParameters(parameters, context) {
    const resolved = {};

    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        // Variable reference
        const varPath = value.substring(1);
        resolved[key] = vmExecutor.getNestedValue(context.variables, varPath);
      } else if (typeof value === 'string' && value.includes('${')) {
        // Template string
        resolved[key] = this.resolveString(value, context);
      } else if (typeof value === 'object' && value !== null) {
        resolved[key] = this.resolveParameters(value, context);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Resolve template string
   */
  resolveString(str, context) {
    return str.replace(/\$\{([^}]+)\}/g, (match, path) => {
      return vmExecutor.getNestedValue(context.variables, path) || match;
    });
  }

  /**
   * Resolve expression
   */
  resolveExpression(expression, context) {
    try {
      return this.parser.evaluate(expression, context.variables);
    } catch (error) {
      logger.error('Expression evaluation failed', { expression, error: error.message });
      return null;
    }
  }

  /**
   * Cancel execution
   */
  async cancelExecution(executionId, userId) {
    const execution = await WorkflowExecution.findByPk(executionId);

    if (!execution) {
      throw new Error('Execution not found');
    }

    if (execution.status === 'completed' || execution.status === 'failed' || execution.status === 'cancelled') {
      throw new Error('Execution already finished');
    }

    await execution.update({
      status: 'cancelled',
      completed_at: new Date(),
      duration: Date.now() - (execution.started_at?.getTime() || Date.now())
    });

    await this.log(executionId, 'warn', 'Execution cancelled by user', null, { userId });

    this.activeExecutions.delete(executionId);

    return execution;
  }

  /**
   * Log execution event
   */
  async log(executionId, level, message, stepId = null, data = null) {
    const execution = await WorkflowExecution.findByPk(executionId);

    if (!execution) {
      logger.warn('Execution not found for logging', { executionId });
      return;
    }

    await WorkflowLog.create({
      execution_id: executionId,
      workflow_id: execution.workflow_id,
      step_id: stepId,
      level,
      message,
      data,
      timestamp: new Date()
    });

    logger[level](`[Execution ${executionId}] ${message}`, { stepId, data });
  }

  /**
   * Execute approval step (human-in-the-loop)
   */
  async executeApproval(step, context, execution) {
    const { approvers, title, description, dueDate, requireAllApprovals } = step.config;

    // Resolve approvers (can be user IDs or expressions)
    const resolvedApprovers = Array.isArray(approvers)
      ? approvers.map(a => (typeof a === 'string' && a.startsWith('$')
          ? vmExecutor.getNestedValue(context.variables, a.substring(1))
          : a))
      : [approvers];

    // Create approval request
    const approvalData = {
      stepId: step.step_id,
      executionId: execution.id,
      workflowId: execution.workflow_id,
      approvers: resolvedApprovers,
      title: this.resolveString(title || step.name, context),
      description: this.resolveString(description || '', context),
      dueDate: dueDate ? new Date(dueDate) : null,
      requireAllApprovals: requireAllApprovals !== false,
      status: 'pending',
      createdAt: new Date()
    };

    // Store approval request in execution context
    context.pendingApprovals = context.pendingApprovals || {};
    context.pendingApprovals[step.step_id] = approvalData;

    await execution.update({ context });

    // Pause execution - will resume when approval is granted
    // In a real implementation, this would trigger notifications to approvers
    // and the workflow would be resumed via an API call when approved

    await this.log(
      execution.id,
      'info',
      `Approval requested from: ${resolvedApprovers.join(', ')}`,
      step.step_id,
      { approvalData }
    );

    // Check if approval already exists (for resume scenarios)
    const existingApproval = context.approvals?.[step.step_id];
    if (existingApproval) {
      if (existingApproval.status === 'approved') {
        return {
          success: true,
          data: {
            approved: true,
            approvedBy: existingApproval.approvedBy,
            approvedAt: existingApproval.approvedAt,
            comments: existingApproval.comments
          }
        };
      } else if (existingApproval.status === 'rejected') {
        return {
          success: false,
          error: `Approval rejected by ${existingApproval.rejectedBy}`,
          data: existingApproval
        };
      }
    }

    // Mark execution as waiting for approval
    await execution.update({
      status: 'waiting_approval',
      current_step_id: step.step_id
    });

    // Return pending status (execution will pause here)
    return {
      success: false,
      error: 'PENDING_APPROVAL',
      data: approvalData,
      shouldPause: true
    };
  }

  /**
   * Execute notification step
   */
  async executeNotification(step, context, execution) {
    const {
      type,
      recipients,
      subject,
      message,
      template,
      channel,
      priority,
      data: notificationData
    } = step.config;

    // Resolve recipients
    const resolvedRecipients = Array.isArray(recipients)
      ? recipients.map(r => (typeof r === 'string' && r.startsWith('$')
          ? vmExecutor.getNestedValue(context.variables, r.substring(1))
          : r))
      : [recipients];

    // Resolve message content
    const resolvedSubject = this.resolveString(subject || '', context);
    const resolvedMessage = this.resolveString(message || '', context);
    const resolvedData = this.resolveParameters(notificationData || {}, context);

    // Build notification payload
    const notification = {
      type: type || 'email', // email, push, sms, webhook
      recipients: resolvedRecipients,
      subject: resolvedSubject,
      message: resolvedMessage,
      template: template || null,
      channel: channel || 'default',
      priority: priority || 'normal',
      data: resolvedData,
      metadata: {
        workflowId: execution.workflow_id,
        executionId: execution.id,
        stepId: step.step_id,
        timestamp: new Date()
      }
    };

    await this.log(
      execution.id,
      'info',
      `Sending ${type || 'email'} notification to: ${resolvedRecipients.join(', ')}`,
      step.step_id,
      { notification }
    );

    try {
      // Send notification to Herald service
      const heraldUrl = process.env.HERALD_URL || 'http://localhost:3014';
      const caToken = context.caToken || process.env.SERVICE_CA_TOKEN;

      if (!caToken) {
        logger.warn('No CA token available for Herald service call');
      }

      const response = await axios.post(
        `${heraldUrl}/api/notifications/send`,
        notification,
        {
          headers: caToken ? { 'Authorization': `Bearer ${caToken}` } : {},
          timeout: 10000
        }
      );

      // Store notification result
      if (step.outputs?.notificationId) {
        vmExecutor.setNestedValue(
          context.variables,
          step.outputs.notificationId,
          response.data.id || response.data.notificationId
        );
      }

      return {
        success: true,
        data: {
          notificationId: response.data.id || response.data.notificationId,
          status: response.data.status || 'sent',
          recipients: resolvedRecipients
        }
      };
    } catch (error) {
      // If Herald service is unavailable, log the notification locally
      logger.warn('Herald service unavailable, notification logged locally', {
        notification,
        error: error.message
      });

      await this.log(
        execution.id,
        'warn',
        `Notification logged (Herald unavailable): ${error.message}`,
        step.step_id,
        { notification }
      );

      // Store notification in execution logs
      context.notifications = context.notifications || [];
      context.notifications.push(notification);

      return {
        success: true,
        data: {
          notificationId: `local_${Date.now()}`,
          status: 'logged',
          recipients: resolvedRecipients,
          warning: 'Herald service unavailable, notification logged locally'
        }
      };
    }
  }

  /**
   * Get execution status
   */
  async getExecutionStatus(executionId) {
    const execution = await WorkflowExecution.findByPk(executionId, {
      include: [
        {
          model: Workflow,
          as: 'workflow',
          attributes: ['id', 'name', 'version']
        },
        {
          model: WorkflowLog,
          as: 'logs',
          order: [['timestamp', 'ASC']],
          limit: 100
        }
      ]
    });

    if (!execution) {
      throw new Error('Execution not found');
    }

    return execution;
  }

  /**
   * Approve pending approval step
   */
  async approveStep(executionId, stepId, userId, comments = null) {
    const execution = await WorkflowExecution.findByPk(executionId);

    if (!execution) {
      throw new Error('Execution not found');
    }

    const context = execution.context || {};
    const pendingApproval = context.pendingApprovals?.[stepId];

    if (!pendingApproval) {
      throw new Error('No pending approval found for this step');
    }

    // Check if user is authorized approver
    if (!pendingApproval.approvers.includes(userId)) {
      throw new Error('User not authorized to approve this step');
    }

    // Record approval
    context.approvals = context.approvals || {};
    context.approvals[stepId] = {
      status: 'approved',
      approvedBy: userId,
      approvedAt: new Date(),
      comments: comments
    };

    // Remove from pending
    delete context.pendingApprovals[stepId];

    await execution.update({ context });

    await this.log(
      executionId,
      'info',
      `Approval granted by user: ${userId}`,
      stepId,
      { comments }
    );

    // Resume execution if it was paused
    if (execution.status === 'waiting_approval') {
      await execution.update({ status: 'running' });
      // Re-execute the workflow from this step
      this.executeWorkflow(executionId).catch(error => {
        logger.error('Failed to resume workflow after approval', {
          executionId,
          error: error.message
        });
      });
    }

    return { success: true, message: 'Approval granted' };
  }

  /**
   * Reject pending approval step
   */
  async rejectStep(executionId, stepId, userId, reason = null) {
    const execution = await WorkflowExecution.findByPk(executionId);

    if (!execution) {
      throw new Error('Execution not found');
    }

    const context = execution.context || {};
    const pendingApproval = context.pendingApprovals?.[stepId];

    if (!pendingApproval) {
      throw new Error('No pending approval found for this step');
    }

    // Check if user is authorized approver
    if (!pendingApproval.approvers.includes(userId)) {
      throw new Error('User not authorized to reject this step');
    }

    // Record rejection
    context.approvals = context.approvals || {};
    context.approvals[stepId] = {
      status: 'rejected',
      rejectedBy: userId,
      rejectedAt: new Date(),
      reason: reason
    };

    // Remove from pending
    delete context.pendingApprovals[stepId];

    await execution.update({
      context,
      status: 'failed',
      completed_at: new Date(),
      error: {
        message: `Approval rejected by ${userId}`,
        reason: reason
      }
    });

    await this.log(
      executionId,
      'warn',
      `Approval rejected by user: ${userId}`,
      stepId,
      { reason }
    );

    return { success: true, message: 'Approval rejected, workflow stopped' };
  }

  // ═══════════════════════════════════════════════════════════
  // LOW-CODE PLATFORM INTEGRATION STEPS
  // ═══════════════════════════════════════════════════════════

  /**
   * Execute Low-Code Create step
   * Creates a new record in a Low-Code entity
   */
  async executeLowCodeCreate(step, context) {
    const params = this.resolveParameters(step.config.parameters || {}, context);
    const { entityId, data, applicationId } = params;

    if (!entityId) {
      return { success: false, error: 'entityId is required' };
    }

    if (!data) {
      return { success: false, error: 'data is required' };
    }

    const result = await lowcodeService.createRecord(entityId, data, {
      userId: context.userId,
      applicationId
    });

    if (result.success) {
      // Store result in context
      context.variables[step.config.outputVariable || 'lowcode_result'] = result.data;
    }

    return result;
  }

  /**
   * Execute Low-Code Read step
   * Reads a record from a Low-Code entity
   */
  async executeLowCodeRead(step, context) {
    const params = this.resolveParameters(step.config.parameters || {}, context);
    const { entityId, recordId, applicationId } = params;

    if (!entityId) {
      return { success: false, error: 'entityId is required' };
    }

    if (!recordId) {
      return { success: false, error: 'recordId is required' };
    }

    const result = await lowcodeService.readRecord(entityId, recordId, {
      userId: context.userId,
      applicationId
    });

    if (result.success) {
      // Store result in context
      context.variables[step.config.outputVariable || 'lowcode_result'] = result.data;
    }

    return result;
  }

  /**
   * Execute Low-Code Update step
   * Updates a record in a Low-Code entity
   */
  async executeLowCodeUpdate(step, context) {
    const params = this.resolveParameters(step.config.parameters || {}, context);
    const { entityId, recordId, data, applicationId } = params;

    if (!entityId) {
      return { success: false, error: 'entityId is required' };
    }

    if (!recordId) {
      return { success: false, error: 'recordId is required' };
    }

    if (!data) {
      return { success: false, error: 'data is required' };
    }

    const result = await lowcodeService.updateRecord(entityId, recordId, data, {
      userId: context.userId,
      applicationId
    });

    if (result.success) {
      // Store result in context
      context.variables[step.config.outputVariable || 'lowcode_result'] = result.data;
    }

    return result;
  }

  /**
   * Execute Low-Code Delete step
   * Deletes a record from a Low-Code entity
   */
  async executeLowCodeDelete(step, context) {
    const params = this.resolveParameters(step.config.parameters || {}, context);
    const { entityId, recordId, softDelete = true, applicationId } = params;

    if (!entityId) {
      return { success: false, error: 'entityId is required' };
    }

    if (!recordId) {
      return { success: false, error: 'recordId is required' };
    }

    const result = await lowcodeService.deleteRecord(entityId, recordId, {
      userId: context.userId,
      applicationId,
      softDelete
    });

    if (result.success) {
      // Store result in context
      context.variables[step.config.outputVariable || 'lowcode_result'] = result.data;
    }

    return result;
  }

  /**
   * Execute Low-Code Query step
   * Queries records from a Low-Code entity
   */
  async executeLowCodeQuery(step, context) {
    const params = this.resolveParameters(step.config.parameters || {}, context);
    const { entityId, query, applicationId } = params;

    if (!entityId) {
      return { success: false, error: 'entityId is required' };
    }

    const result = await lowcodeService.queryRecords(entityId, query || {}, {
      userId: context.userId,
      applicationId
    });

    if (result.success) {
      // Store result in context
      context.variables[step.config.outputVariable || 'lowcode_result'] = result.data;
    }

    return result;
  }

  /**
   * Execute Low-Code Formula step
   * Executes a formula/computed field on a Low-Code entity record
   */
  async executeLowCodeFormula(step, context) {
    const params = this.resolveParameters(step.config.parameters || {}, context);
    const { entityId, recordId, formulaName, applicationId } = params;

    if (!entityId) {
      return { success: false, error: 'entityId is required' };
    }

    if (!recordId) {
      return { success: false, error: 'recordId is required' };
    }

    if (!formulaName) {
      return { success: false, error: 'formulaName is required' };
    }

    const result = await lowcodeService.executeFormula(entityId, recordId, formulaName, {
      userId: context.userId,
      applicationId
    });

    if (result.success) {
      // Store result in context
      context.variables[step.config.outputVariable || 'lowcode_result'] = result.data;
    }

    return result;
  }
}

module.exports = new ExecutionEngine();
