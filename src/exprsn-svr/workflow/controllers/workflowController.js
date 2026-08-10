const workflowEngine = require('../services/workflowEngine');
const logger = require('../utils/logger');

/**
 * Create new workflow
 */
const createWorkflow = async (req, res) => {
  try {
    const workflow = await workflowEngine.createWorkflow(req.validatedBody, req.user.id);

    logger.info('Workflow created', {
      workflowId: workflow.id,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      data: workflow
    });
  } catch (error) {
    logger.error('Failed to create workflow', {
      error: error.message,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get workflow by ID
 */
const getWorkflow = async (req, res) => {
  try {
    const workflow = await workflowEngine.getWorkflow(req.params.id);

    res.json({
      success: true,
      data: workflow
    });
  } catch (error) {
    logger.error('Failed to get workflow', {
      error: error.message,
      workflowId: req.params.id
    });

    res.status(404).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Update workflow
 */
const updateWorkflow = async (req, res) => {
  try {
    const workflow = await workflowEngine.updateWorkflow(
      req.params.id,
      req.validatedBody,
      req.user.id
    );

    logger.info('Workflow updated', {
      workflowId: workflow.id,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: workflow
    });
  } catch (error) {
    logger.error('Failed to update workflow', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Delete workflow
 */
const deleteWorkflow = async (req, res) => {
  try {
    const result = await workflowEngine.deleteWorkflow(req.params.id, req.user.id);

    logger.info('Workflow deleted', {
      workflowId: req.params.id,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    logger.error('Failed to delete workflow', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * List workflows
 */
const listWorkflows = async (req, res) => {
  try {
    const filters = {
      status: req.validatedQuery.status,
      triggerType: req.validatedQuery.triggerType,
      category: req.validatedQuery.category,
      isTemplate: req.validatedQuery.isTemplate,
      tags: req.validatedQuery.tags
        ? Array.isArray(req.validatedQuery.tags)
          ? req.validatedQuery.tags
          : [req.validatedQuery.tags]
        : undefined
    };

    // Only show user's workflows unless they're admin
    if (!req.user.roles || !req.user.roles.includes('admin')) {
      filters.ownerId = req.user.id;
    }

    const pagination = {
      page: req.validatedQuery.page,
      limit: req.validatedQuery.limit,
      sortBy: req.validatedQuery.sortBy,
      sortOrder: req.validatedQuery.sortOrder
    };

    const result = await workflowEngine.listWorkflows(filters, pagination);

    res.json({
      success: true,
      data: result.workflows,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('Failed to list workflows', {
      error: error.message,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Clone workflow
 */
const cloneWorkflow = async (req, res) => {
  try {
    const { name } = req.body;

    const workflow = await workflowEngine.cloneWorkflow(
      req.params.id,
      req.user.id,
      name
    );

    logger.info('Workflow cloned', {
      sourceId: req.params.id,
      newId: workflow.id,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      data: workflow
    });
  } catch (error) {
    logger.error('Failed to clone workflow', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get workflow statistics
 */
const getWorkflowStats = async (req, res) => {
  try {
    const workflow = await workflowEngine.getWorkflow(req.params.id);

    const stats = {
      executionCount: workflow.execution_count,
      successCount: workflow.success_count,
      failureCount: workflow.failure_count,
      successRate: workflow.execution_count > 0
        ? (workflow.success_count / workflow.execution_count * 100).toFixed(2)
        : 0,
      averageDuration: workflow.average_duration,
      lastExecuted: workflow.last_executed_at
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get workflow stats', {
      error: error.message,
      workflowId: req.params.id
    });

    res.status(404).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  createWorkflow,
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,
  listWorkflows,
  cloneWorkflow,
  getWorkflowStats
};
