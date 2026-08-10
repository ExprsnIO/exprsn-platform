/**
 * Process Execution Service
 * BPMN 2.0 Runtime Engine for Process Execution
 */

const { Process, ProcessInstance } = require('../models');
const logger = require('../utils/logger');
const axios = require('axios');
const { VM } = require('vm2');

class ProcessExecutionService {
  constructor() {
    this.workflowServiceUrl = process.env.WORKFLOW_SERVICE_URL || 'http://localhost:3017';
    this.forgeServiceUrl = process.env.FORGE_SERVICE_URL || 'http://localhost:3016';
  }

  /**
   * Start a new process instance
   */
  async startProcess(processId, inputData = {}, userId) {
    try {
      // Load process definition
      const process = await Process.findByPk(processId);
      if (!process) {
        return { success: false, error: 'Process not found' };
      }

      if (process.status !== 'active') {
        return { success: false, error: 'Process must be active to start' };
      }

      // Create process instance
      const instance = await ProcessInstance.create({
        processId,
        initiatedBy: userId,
        inputData,
        status: 'running',
        currentStep: 'start',
        variables: inputData || {},
        executionLog: []
      });

      logger.info('[ProcessExecution] Process instance started', {
        instanceId: instance.id,
        processId,
        userId
      });

      // Begin execution
      await this.executeProcess(instance, process);

      return {
        success: true,
        instance: await ProcessInstance.findByPk(instance.id)
      };
    } catch (error) {
      logger.error('[ProcessExecution] Error starting process:', error);
      return {
        success: false,
        error: 'EXECUTION_ERROR',
        message: error.message
      };
    }
  }

  /**
   * Execute process from current state
   */
  async executeProcess(instance, process) {
    try {
      const definition = process.definition || {};
      const elements = definition.elements || [];

      // Find current element
      let currentElement = elements.find(el =>
        el.type === 'start-event' || el.id === instance.currentStep
      );

      if (!currentElement) {
        await this.completeInstance(instance, 'error', 'No start event found');
        return;
      }

      // Execute elements sequentially
      while (currentElement && instance.status === 'running') {
        this.logExecution(instance, 'info', `Executing element: ${currentElement.name}`, {
          elementId: currentElement.id,
          elementType: currentElement.type
        });

        // Execute element
        const result = await this.executeElement(currentElement, instance, process);

        if (!result.success) {
          await this.completeInstance(instance, 'error', result.error);
          return;
        }

        // Update variables
        if (result.variables) {
          instance.variables = { ...instance.variables, ...result.variables };
          await instance.save();
        }

        // Check if process should end
        if (currentElement.type === 'end-event') {
          await this.completeInstance(instance, 'completed', 'Process completed successfully');
          return;
        }

        // Find next element
        currentElement = this.findNextElement(currentElement, elements, definition.connections, instance);

        if (!currentElement) {
          await this.completeInstance(instance, 'error', 'No next element found');
          return;
        }

        // Update current step
        instance.currentStep = currentElement.id;
        await instance.save();
      }
    } catch (error) {
      logger.error('[ProcessExecution] Execution error:', error);
      await this.completeInstance(instance, 'error', error.message);
    }
  }

  /**
   * Execute a single BPMN element
   */
  async executeElement(element, instance, process) {
    const { type, properties } = element;

    try {
      switch (type) {
        case 'start-event':
          return { success: true };

        case 'end-event':
          return { success: true };

        case 'timer-event':
          return await this.executeTimerEvent(element, instance);

        case 'user-task':
          return await this.executeUserTask(element, instance);

        case 'service-task':
          return await this.executeServiceTask(element, instance);

        case 'workflow-task':
          return await this.executeWorkflowTask(element, instance);

        case 'crm-task':
          return await this.executeCRMTask(element, instance);

        case 'script-task':
          return await this.executeScriptTask(element, instance);

        case 'exclusive-gateway':
          return await this.executeExclusiveGateway(element, instance);

        case 'parallel-gateway':
          return await this.executeParallelGateway(element, instance);

        default:
          logger.warn('[ProcessExecution] Unknown element type:', type);
          return { success: true }; // Skip unknown elements
      }
    } catch (error) {
      logger.error('[ProcessExecution] Element execution error:', error);
      return {
        success: false,
        error: `Failed to execute ${type}: ${error.message}`
      };
    }
  }

  /**
   * Execute timer event
   */
  async executeTimerEvent(element, instance) {
    const { timerType, timerValue } = element.properties;

    this.logExecution(instance, 'info', `Timer event: ${timerType} - ${timerValue}`);

    // For now, we'll just log the timer. In production, you'd schedule this with Bull queue
    // TODO: Implement actual timer scheduling with Bull

    return { success: true };
  }

  /**
   * Execute user task (pause and wait for user action)
   */
  async executeUserTask(element, instance) {
    const { assignee, dueDate, formKey } = element.properties;

    this.logExecution(instance, 'info', `User task assigned to: ${assignee || 'unassigned'}`);

    // Update instance to waiting state
    instance.status = 'waiting';
    instance.currentStep = element.id;
    instance.waitingFor = {
      type: 'user-task',
      elementId: element.id,
      assignee,
      dueDate,
      formKey
    };
    await instance.save();

    // In production, you would:
    // 1. Create a task in the task list
    // 2. Send notification to assignee
    // 3. Return and wait for user to complete the task

    return { success: true };
  }

  /**
   * Complete a user task and resume process
   */
  async completeUserTask(instanceId, taskData, userId) {
    const instance = await ProcessInstance.findByPk(instanceId);
    if (!instance || instance.status !== 'waiting') {
      return { success: false, error: 'Instance not waiting for user task' };
    }

    this.logExecution(instance, 'info', `User task completed by: ${userId}`, { taskData });

    // Update variables with task data
    instance.variables = { ...instance.variables, ...taskData };
    instance.status = 'running';
    instance.waitingFor = null;
    await instance.save();

    // Resume process execution
    const process = await Process.findByPk(instance.processId);
    await this.executeProcess(instance, process);

    return { success: true, instance };
  }

  /**
   * Execute service task
   */
  async executeServiceTask(element, instance) {
    this.logExecution(instance, 'info', `Executing service task: ${element.name}`);

    // Service tasks can call external APIs or internal services
    // Implementation depends on your specific requirements

    return { success: true };
  }

  /**
   * Execute workflow task (integration with exprsn-workflow)
   */
  async executeWorkflowTask(element, instance) {
    const { workflowId, inputMapping, outputMapping } = element.properties;

    if (!workflowId) {
      return { success: false, error: 'No workflow specified' };
    }

    this.logExecution(instance, 'info', `Executing workflow: ${workflowId}`);

    try {
      // Map process variables to workflow inputs
      const workflowInputs = {};
      Object.entries(inputMapping || {}).forEach(([processVar, workflowInput]) => {
        workflowInputs[workflowInput] = instance.variables[processVar];
      });

      // Execute workflow via exprsn-workflow service
      const response = await axios.post(
        `${this.workflowServiceUrl}/api/workflows/${workflowId}/execute`,
        { inputs: workflowInputs },
        {
          headers: {
            'Content-Type': 'application/json'
            // TODO: Add CA token authentication
          },
          timeout: 60000 // 60 second timeout
        }
      );

      if (!response.data.success) {
        return {
          success: false,
          error: `Workflow execution failed: ${response.data.error}`
        };
      }

      // Map workflow outputs to process variables
      const variables = {};
      Object.entries(outputMapping || {}).forEach(([processVar, workflowOutput]) => {
        variables[processVar] = response.data.result?.outputs?.[workflowOutput];
      });

      this.logExecution(instance, 'info', 'Workflow completed', {
        workflowId,
        outputs: variables
      });

      return {
        success: true,
        variables
      };
    } catch (error) {
      logger.error('[ProcessExecution] Workflow execution error:', error);
      return {
        success: false,
        error: `Workflow execution failed: ${error.message}`
      };
    }
  }

  /**
   * Execute CRM task (integration with exprsn-forge)
   */
  async executeCRMTask(element, instance) {
    const { crmEntity, crmOperation, fieldMapping } = element.properties;

    if (!crmEntity || !crmOperation) {
      return { success: false, error: 'CRM entity or operation not specified' };
    }

    this.logExecution(instance, 'info', `CRM ${crmOperation}: ${crmEntity}`);

    try {
      // Map process variables to CRM fields
      const crmData = {};
      Object.entries(fieldMapping || {}).forEach(([crmField, processVar]) => {
        crmData[crmField] = instance.variables[processVar];
      });

      let response;
      const entityPath = this.getCRMEntityPath(crmEntity);

      // Execute CRM operation
      switch (crmOperation) {
        case 'create':
          response = await axios.post(
            `${this.forgeServiceUrl}/api/crm/${entityPath}`,
            crmData,
            { headers: { 'Content-Type': 'application/json' } }
          );
          break;

        case 'update':
          const recordId = instance.variables.crmRecordId || crmData.id;
          if (!recordId) {
            return { success: false, error: 'No record ID for update' };
          }
          response = await axios.put(
            `${this.forgeServiceUrl}/api/crm/${entityPath}/${recordId}`,
            crmData,
            { headers: { 'Content-Type': 'application/json' } }
          );
          break;

        case 'read':
          const readId = instance.variables.crmRecordId || crmData.id;
          if (!readId) {
            return { success: false, error: 'No record ID for read' };
          }
          response = await axios.get(
            `${this.forgeServiceUrl}/api/crm/${entityPath}/${readId}`
          );
          break;

        case 'delete':
          const deleteId = instance.variables.crmRecordId || crmData.id;
          if (!deleteId) {
            return { success: false, error: 'No record ID for delete' };
          }
          response = await axios.delete(
            `${this.forgeServiceUrl}/api/crm/${entityPath}/${deleteId}`
          );
          break;

        default:
          return { success: false, error: `Unknown CRM operation: ${crmOperation}` };
      }

      if (!response.data.success && response.status !== 200) {
        return {
          success: false,
          error: `CRM operation failed: ${response.data.error || 'Unknown error'}`
        };
      }

      // Store CRM record ID in process variables
      const variables = {};
      if (crmOperation === 'create' && response.data.data?.id) {
        variables.crmRecordId = response.data.data.id;
        variables[`${crmEntity.toLowerCase()}Id`] = response.data.data.id;
      } else if (crmOperation === 'read' && response.data.data) {
        // Store all CRM fields in process variables
        Object.keys(response.data.data).forEach(key => {
          variables[`crm_${key}`] = response.data.data[key];
        });
      }

      this.logExecution(instance, 'info', `CRM ${crmOperation} completed`, {
        entity: crmEntity,
        variables
      });

      return {
        success: true,
        variables
      };
    } catch (error) {
      logger.error('[ProcessExecution] CRM task error:', error);
      return {
        success: false,
        error: `CRM operation failed: ${error.message}`
      };
    }
  }

  /**
   * Get CRM entity path for API calls
   */
  getCRMEntityPath(entity) {
    const paths = {
      'Contact': 'contacts',
      'Account': 'accounts',
      'Lead': 'leads',
      'Opportunity': 'opportunities',
      'Case': 'cases',
      'Task': 'tasks'
    };
    return paths[entity] || entity.toLowerCase() + 's';
  }

  /**
   * Execute script task (JavaScript execution in sandbox)
   */
  async executeScriptTask(element, instance) {
    const { script, timeout } = element.properties;

    if (!script) {
      return { success: false, error: 'No script provided' };
    }

    this.logExecution(instance, 'info', 'Executing script task');

    try {
      // Create sandboxed VM
      const vm = new VM({
        timeout: timeout || 30000,
        sandbox: {
          context: {
            processInstanceId: instance.id,
            processId: instance.processId
          },
          variables: { ...instance.variables },
          console: {
            log: (...args) => logger.info('[Script]', ...args),
            error: (...args) => logger.error('[Script]', ...args)
          }
        }
      });

      // Execute script
      const result = vm.run(script);

      if (typeof result === 'object' && result !== null) {
        this.logExecution(instance, 'info', 'Script completed', { result });

        return {
          success: true,
          variables: result
        };
      }

      return { success: true };
    } catch (error) {
      logger.error('[ProcessExecution] Script execution error:', error);
      return {
        success: false,
        error: `Script execution failed: ${error.message}`
      };
    }
  }

  /**
   * Execute exclusive gateway (XOR - single path)
   */
  async executeExclusiveGateway(element, instance) {
    this.logExecution(instance, 'info', `Exclusive gateway: ${element.name}`);

    // Exclusive gateway evaluation is handled in findNextElement
    // based on outgoing sequence flow conditions

    return { success: true };
  }

  /**
   * Execute parallel gateway (AND - multiple paths)
   */
  async executeParallelGateway(element, instance) {
    this.logExecution(instance, 'info', `Parallel gateway: ${element.name}`);

    // Parallel gateway creates multiple execution threads
    // For now, we'll just continue with the first path
    // TODO: Implement true parallel execution with thread tracking

    return { success: true };
  }

  /**
   * Find next element in process flow
   */
  findNextElement(currentElement, elements, connections, instance) {
    if (!connections || connections.length === 0) {
      // No connections defined, try to find by position or return null
      return null;
    }

    // Find outgoing connections from current element
    const outgoing = connections.filter(conn => conn.sourceId === currentElement.id);

    if (outgoing.length === 0) {
      return null; // No outgoing connections
    }

    if (outgoing.length === 1) {
      // Single outgoing connection
      const targetId = outgoing[0].targetId;
      return elements.find(el => el.id === targetId);
    }

    // Multiple outgoing connections (gateway)
    // Evaluate conditions if present
    for (const conn of outgoing) {
      if (this.evaluateCondition(conn.condition, instance)) {
        const targetId = conn.targetId;
        return elements.find(el => el.id === targetId);
      }
    }

    // No condition matched, take default flow
    const defaultFlow = outgoing.find(conn => conn.isDefault);
    if (defaultFlow) {
      const targetId = defaultFlow.targetId;
      return elements.find(el => el.id === targetId);
    }

    // No default, take first
    const targetId = outgoing[0].targetId;
    return elements.find(el => el.id === targetId);
  }

  /**
   * Evaluate sequence flow condition
   */
  evaluateCondition(condition, instance) {
    if (!condition) return true; // No condition = always true

    try {
      // Simple condition evaluation
      // Format: ${variable} == 'value' or ${variable} > 10
      const variables = instance.variables;

      // Replace variable placeholders
      let expression = condition;
      Object.keys(variables).forEach(key => {
        const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
        const value = typeof variables[key] === 'string' ? `'${variables[key]}'` : variables[key];
        expression = expression.replace(regex, value);
      });

      // Evaluate expression
      return eval(expression); // eslint-disable-line no-eval
    } catch (error) {
      logger.error('[ProcessExecution] Condition evaluation error:', error);
      return false;
    }
  }

  /**
   * Complete process instance
   */
  async completeInstance(instance, status, message) {
    instance.status = status;
    instance.completedAt = new Date();
    instance.endMessage = message;
    await instance.save();

    this.logExecution(instance, status === 'completed' ? 'info' : 'error', message);

    logger.info('[ProcessExecution] Process instance completed', {
      instanceId: instance.id,
      status,
      message
    });
  }

  /**
   * Log execution event
   */
  logExecution(instance, level, message, data = {}) {
    if (!instance.executionLog) instance.executionLog = [];

    instance.executionLog.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    });

    // Save asynchronously to avoid blocking
    instance.save().catch(err => {
      logger.error('[ProcessExecution] Failed to save execution log:', err);
    });
  }

  /**
   * Get process instance with execution log
   */
  async getProcessInstance(instanceId) {
    const instance = await ProcessInstance.findByPk(instanceId);
    if (!instance) {
      return { success: false, error: 'Process instance not found' };
    }

    return {
      success: true,
      instance
    };
  }

  /**
   * Cancel process instance
   */
  async cancelProcessInstance(instanceId, userId, reason) {
    const instance = await ProcessInstance.findByPk(instanceId);
    if (!instance) {
      return { success: false, error: 'Process instance not found' };
    }

    if (instance.status === 'completed' || instance.status === 'error') {
      return { success: false, error: 'Cannot cancel completed process' };
    }

    this.logExecution(instance, 'warn', `Process cancelled by user: ${reason}`, { userId });

    instance.status = 'cancelled';
    instance.completedAt = new Date();
    instance.endMessage = `Cancelled by user: ${reason}`;
    await instance.save();

    logger.info('[ProcessExecution] Process instance cancelled', {
      instanceId,
      userId,
      reason
    });

    return { success: true, instance };
  }

  /**
   * List process instances with filters
   */
  async listProcessInstances(processId, filters = {}) {
    const where = { processId };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.initiatedBy) {
      where.initiatedBy = filters.initiatedBy;
    }

    const instances = await ProcessInstance.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: filters.limit || 50,
      offset: filters.offset || 0
    });

    const total = await ProcessInstance.count({ where });

    return {
      success: true,
      instances,
      total,
      page: Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1,
      pages: Math.ceil(total / (filters.limit || 50))
    };
  }
}

module.exports = new ProcessExecutionService();
