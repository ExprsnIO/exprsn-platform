const executionEngine = require('../services/executionEngine');
const { WorkflowExecution, Workflow } = require('../models');
const auditService = require('../services/auditService');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

/**
 * Start workflow execution
 */
const startExecution = async (req, res) => {
  try {
    const { inputData, priority, triggerType, triggerData } = req.validatedBody;

    const execution = await executionEngine.startExecution(
      req.params.workflowId,
      inputData,
      req.user.id,
      {
        priority,
        triggerType,
        triggerData
      }
    );

    logger.info('Workflow execution started', {
      executionId: execution.id,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(202).json({
      success: true,
      data: execution,
      message: 'Workflow execution started'
    });
  } catch (error) {
    logger.error('Failed to start workflow execution', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get execution status
 */
const getExecutionStatus = async (req, res) => {
  try {
    const execution = await executionEngine.getExecutionStatus(req.params.id);

    res.json({
      success: true,
      data: execution
    });
  } catch (error) {
    logger.error('Failed to get execution status', {
      error: error.message,
      executionId: req.params.id
    });

    res.status(404).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Cancel execution
 */
const cancelExecution = async (req, res) => {
  try {
    const execution = await executionEngine.cancelExecution(req.params.id, req.user.id);

    logger.info('Workflow execution cancelled', {
      executionId: req.params.id,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: execution,
      message: 'Execution cancelled successfully'
    });
  } catch (error) {
    logger.error('Failed to cancel execution', {
      error: error.message,
      executionId: req.params.id,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * List executions
 */
const listExecutions = async (req, res) => {
  try {
    const {
      workflowId,
      status,
      labels,
      page,
      limit,
      sortBy,
      sortOrder
    } = req.validatedQuery;

    const where = {};

    if (workflowId) {
      where.workflow_id = workflowId;
    }

    if (status) {
      where.status = status;
    }

    // Filter by labels (comma-separated list)
    if (labels) {
      const labelArray = labels.split(',').map(l => l.trim());
      where.labels = {
        [Op.overlap]: labelArray
      };
    }

    // Only show user's executions unless they're admin
    if (!req.user.roles || !req.user.roles.includes('admin')) {
      where.initiated_by = req.user.id;
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await WorkflowExecution.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      include: [
        {
          model: Workflow,
          as: 'workflow',
          attributes: ['id', 'name', 'version']
        }
      ]
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    logger.error('Failed to list executions', {
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
 * Get execution logs
 */
const getExecutionLogs = async (req, res) => {
  try {
    const { WorkflowLog } = require('../models');

    const logs = await WorkflowLog.findAll({
      where: {
        execution_id: req.params.id
      },
      order: [['timestamp', 'ASC']],
      limit: 1000
    });

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    logger.error('Failed to get execution logs', {
      error: error.message,
      executionId: req.params.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Retry failed execution
 */
const retryExecution = async (req, res) => {
  try {
    const execution = await WorkflowExecution.findByPk(req.params.id);

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

    if (execution.status !== 'failed' && execution.status !== 'timeout') {
      return res.status(400).json({
        success: false,
        error: 'Can only retry failed or timeout executions'
      });
    }

    // Start new execution with same input data
    const newExecution = await executionEngine.startExecution(
      execution.workflow_id,
      execution.input_data,
      req.user.id,
      {
        priority: execution.priority,
        triggerType: 'manual_retry',
        triggerData: {
          originalExecutionId: execution.id
        }
      }
    );

    logger.info('Workflow execution retried', {
      originalExecutionId: execution.id,
      newExecutionId: newExecution.id,
      userId: req.user.id
    });

    // Log audit event
    await auditService.logExecutionRetry(execution, newExecution, req.user.id, req);

    res.status(202).json({
      success: true,
      data: newExecution,
      message: 'Execution retried successfully',
      originalExecutionId: execution.id
    });
  } catch (error) {
    logger.error('Failed to retry execution', {
      error: error.message,
      executionId: req.params.id,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get execution statistics
 */
const getExecutionStatistics = async (req, res) => {
  try {
    const { workflowId } = req.query;
    const where = {};

    if (workflowId) {
      where.workflow_id = workflowId;
    }

    // Only show user's executions unless they're admin
    if (!req.user.roles || !req.user.roles.includes('admin')) {
      where.initiated_by = req.user.id;
    }

    const [
      total,
      completed,
      failed,
      running,
      avgDuration
    ] = await Promise.all([
      WorkflowExecution.count({ where }),
      WorkflowExecution.count({ where: { ...where, status: 'completed' } }),
      WorkflowExecution.count({ where: { ...where, status: 'failed' } }),
      WorkflowExecution.count({ where: { ...where, status: 'running' } }),
      WorkflowExecution.findOne({
        where: { ...where, status: 'completed', duration: { [Op.ne]: null } },
        attributes: [
          [require('sequelize').fn('AVG', require('sequelize').col('duration')), 'avg']
        ]
      })
    ]);

    const stats = {
      total,
      completed,
      failed,
      running,
      pending: total - completed - failed - running,
      successRate: total > 0 ? ((completed / total) * 100).toFixed(2) : 0,
      averageDuration: avgDuration?.get('avg') ? Math.round(avgDuration.get('avg')) : null
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get execution statistics', {
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
 * Add labels to execution
 */
const addExecutionLabels = async (req, res) => {
  try {
    const { labels } = req.body;
    const execution = await WorkflowExecution.findByPk(req.params.id);

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

    // Merge with existing labels (avoid duplicates)
    const currentLabels = execution.labels || [];
    const newLabels = [...new Set([...currentLabels, ...labels])];

    await execution.update({ labels: newLabels });

    logger.info('Labels added to execution', {
      executionId: execution.id,
      labels: newLabels,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: execution,
      message: 'Labels added successfully'
    });
  } catch (error) {
    logger.error('Failed to add labels to execution', {
      error: error.message,
      executionId: req.params.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Remove labels from execution
 */
const removeExecutionLabels = async (req, res) => {
  try {
    const { labels } = req.body;
    const execution = await WorkflowExecution.findByPk(req.params.id);

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

    // Remove specified labels
    const currentLabels = execution.labels || [];
    const updatedLabels = currentLabels.filter(label => !labels.includes(label));

    await execution.update({ labels: updatedLabels });

    logger.info('Labels removed from execution', {
      executionId: execution.id,
      removedLabels: labels,
      remainingLabels: updatedLabels,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: execution,
      message: 'Labels removed successfully'
    });
  } catch (error) {
    logger.error('Failed to remove labels from execution', {
      error: error.message,
      executionId: req.params.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get all available labels
 */
const getAllLabels = async (req, res) => {
  try {
    // Get all unique labels from all executions
    const executions = await WorkflowExecution.findAll({
      attributes: ['labels'],
      where: {
        labels: {
          [Op.ne]: null
        }
      }
    });

    // Flatten and deduplicate labels
    const allLabels = [...new Set(
      executions.flatMap(e => e.labels || [])
    )].sort();

    res.json({
      success: true,
      data: allLabels
    });
  } catch (error) {
    logger.error('Failed to get all labels', {
      error: error.message
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  startExecution,
  getExecutionStatus,
  cancelExecution,
  listExecutions,
  getExecutionLogs,
  retryExecution,
  getExecutionStatistics,
  addExecutionLabels,
  removeExecutionLabels,
  getAllLabels
};
