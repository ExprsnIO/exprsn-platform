const { Workflow, WorkflowStep, WorkflowExecution, WorkflowLog } = require('../models');
const logger = require('../utils/logger');
const Joi = require('joi');

class WorkflowEngine {
  constructor() {
    this.maxExecutionTime = parseInt(process.env.WORKFLOW_MAX_EXECUTION_TIME, 10) || 300000;
    this.maxSteps = parseInt(process.env.WORKFLOW_MAX_STEPS, 10) || 100;
    this.maxIterations = parseInt(process.env.WORKFLOW_MAX_ITERATIONS, 10) || 1000;
  }

  /**
   * Validate workflow definition
   */
  async validateWorkflowDefinition(definition) {
    const schema = Joi.object({
      version: Joi.string().required(),
      steps: Joi.array().items(Joi.object({
        id: Joi.string().required(),
        type: Joi.string().valid(
          'action', 'condition', 'loop', 'parallel', 'switch',
          'trigger', 'javascript', 'api_call', 'data_transform',
          'wait', 'approval', 'notification', 'subworkflow',
          // Low-Code Entity integration step types
          'lowcode_create', 'lowcode_read', 'lowcode_update',
          'lowcode_delete', 'lowcode_query', 'lowcode_formula'
        ).required(),
        name: Joi.string().required(),
        config: Joi.object().required(),
        next: Joi.alternatives().try(
          Joi.string(),
          Joi.array().items(Joi.string()),
          Joi.object()
        ).optional()
      })).min(1).max(this.maxSteps).required(),
      connections: Joi.array().items(Joi.object({
        from: Joi.string().required(),
        to: Joi.string().required(),
        condition: Joi.string().optional()
      })).optional(),
      variables: Joi.object().optional(),
      settings: Joi.object().optional()
    });

    const { error, value } = schema.validate(definition);
    if (error) {
      throw new Error(`Invalid workflow definition: ${error.message}`);
    }

    // Validate step references
    const stepIds = new Set(value.steps.map(s => s.id));

    for (const step of value.steps) {
      if (step.next) {
        const nextSteps = Array.isArray(step.next)
          ? step.next
          : typeof step.next === 'object'
            ? Object.values(step.next)
            : [step.next];

        for (const nextStep of nextSteps) {
          if (!stepIds.has(nextStep)) {
            throw new Error(`Step ${step.id} references non-existent next step: ${nextStep}`);
          }
        }
      }
    }

    // Check for cycles
    this.detectCycles(value.steps);

    return value;
  }

  /**
   * Detect cycles in workflow definition
   */
  detectCycles(steps) {
    const graph = new Map();

    // Build adjacency list
    for (const step of steps) {
      graph.set(step.id, []);

      if (step.next) {
        const nextSteps = Array.isArray(step.next)
          ? step.next
          : typeof step.next === 'object'
            ? Object.values(step.next)
            : [step.next];

        graph.get(step.id).push(...nextSteps);
      }
    }

    // DFS to detect cycles
    const visited = new Set();
    const recursionStack = new Set();

    const hasCycle = (node) => {
      visited.add(node);
      recursionStack.add(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const step of steps) {
      if (!visited.has(step.id)) {
        if (hasCycle(step.id)) {
          throw new Error('Workflow contains cycles without proper loop steps');
        }
      }
    }
  }

  /**
   * Create workflow
   */
  async createWorkflow(workflowData, userId) {
    try {
      // Validate definition
      const validatedDefinition = await this.validateWorkflowDefinition(workflowData.definition);

      // Create workflow
      const workflow = await Workflow.create({
        name: workflowData.name,
        description: workflowData.description,
        version: 1,
        status: workflowData.status || 'draft',
        trigger_type: workflowData.triggerType || 'manual',
        trigger_config: workflowData.triggerConfig,
        definition: validatedDefinition,
        variables: workflowData.variables || {},
        permissions: workflowData.permissions || {},
        jsonlex_schema: workflowData.jsonlexSchema,
        tags: workflowData.tags || [],
        category: workflowData.category,
        owner_id: userId,
        is_template: workflowData.isTemplate || false,
        template_category: workflowData.templateCategory,
        settings: {
          ...workflowData.settings,
          maxExecutionTime: workflowData.settings?.maxExecutionTime || this.maxExecutionTime,
          maxSteps: workflowData.settings?.maxSteps || this.maxSteps,
          maxIterations: workflowData.settings?.maxIterations || this.maxIterations
        }
      });

      // Create workflow steps
      const steps = validatedDefinition.steps.map((step, index) => ({
        workflow_id: workflow.id,
        step_id: step.id,
        step_type: step.type,
        name: step.name,
        description: step.description,
        position: step.position,
        config: step.config,
        inputs: step.inputs,
        outputs: step.outputs,
        conditions: step.conditions,
        next_steps: step.next,
        error_handler: step.errorHandler,
        timeout: step.timeout,
        retry_config: step.retryConfig,
        flags: step.flags || {},
        order: index,
        is_enabled: step.isEnabled !== false
      }));

      await WorkflowStep.bulkCreate(steps);

      logger.info(`Workflow created: ${workflow.id}`, {
        workflowId: workflow.id,
        name: workflow.name,
        userId
      });

      return await this.getWorkflow(workflow.id);
    } catch (error) {
      logger.error('Failed to create workflow', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(workflowId) {
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

    return workflow;
  }

  /**
   * Update workflow
   */
  async updateWorkflow(workflowId, updates, userId) {
    const workflow = await this.getWorkflow(workflowId);

    // Check ownership or permissions
    if (workflow.owner_id !== userId) {
      // TODO: Check RBAC permissions
      throw new Error('Unauthorized to update this workflow');
    }

    // If definition is being updated, validate it
    if (updates.definition) {
      updates.definition = await this.validateWorkflowDefinition(updates.definition);

      // Increment version
      updates.version = workflow.version + 1;

      // Delete old steps and create new ones
      await WorkflowStep.destroy({ where: { workflow_id: workflowId } });

      const steps = updates.definition.steps.map((step, index) => ({
        workflow_id: workflowId,
        step_id: step.id,
        step_type: step.type,
        name: step.name,
        description: step.description,
        position: step.position,
        config: step.config,
        inputs: step.inputs,
        outputs: step.outputs,
        conditions: step.conditions,
        next_steps: step.next,
        error_handler: step.errorHandler,
        timeout: step.timeout,
        retry_config: step.retryConfig,
        flags: step.flags || {},
        order: index,
        is_enabled: step.isEnabled !== false
      }));

      await WorkflowStep.bulkCreate(steps);
    }

    // Update workflow
    await workflow.update(updates);

    logger.info(`Workflow updated: ${workflowId}`, {
      workflowId,
      version: workflow.version,
      userId
    });

    return await this.getWorkflow(workflowId);
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(workflowId, userId) {
    const workflow = await this.getWorkflow(workflowId);

    // Check ownership or permissions
    if (workflow.owner_id !== userId) {
      throw new Error('Unauthorized to delete this workflow');
    }

    await workflow.destroy();

    logger.info(`Workflow deleted: ${workflowId}`, { workflowId, userId });

    return { success: true, message: 'Workflow deleted successfully' };
  }

  /**
   * List workflows
   */
  async listWorkflows(filters = {}, pagination = {}) {
    const {
      status,
      triggerType,
      ownerId,
      category,
      isTemplate,
      tags
    } = filters;

    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = pagination;

    const where = {};
    if (status) where.status = status;
    if (triggerType) where.trigger_type = triggerType;
    if (ownerId) where.owner_id = ownerId;
    if (category) where.category = category;
    if (isTemplate !== undefined) where.is_template = isTemplate;
    if (tags && tags.length > 0) {
      where.tags = { [require('sequelize').Op.contains]: tags };
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await Workflow.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]]
    });

    return {
      workflows: rows,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    };
  }

  /**
   * Clone workflow
   */
  async cloneWorkflow(workflowId, userId, newName) {
    const sourceWorkflow = await this.getWorkflow(workflowId);

    const clonedData = {
      name: newName || `${sourceWorkflow.name} (Copy)`,
      description: sourceWorkflow.description,
      status: 'draft',
      triggerType: sourceWorkflow.trigger_type,
      triggerConfig: sourceWorkflow.trigger_config,
      definition: sourceWorkflow.definition,
      variables: sourceWorkflow.variables,
      permissions: sourceWorkflow.permissions,
      jsonlexSchema: sourceWorkflow.jsonlex_schema,
      tags: sourceWorkflow.tags,
      category: sourceWorkflow.category,
      settings: sourceWorkflow.settings
    };

    return await this.createWorkflow(clonedData, userId);
  }
}

module.exports = new WorkflowEngine();
