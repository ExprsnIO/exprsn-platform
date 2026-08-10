/**
 * ═══════════════════════════════════════════════════════════
 * Workflow Analytics Routes
 * Analytics and metrics for workflow executions
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const WorkflowExecution = require('../models/WorkflowExecution');
const Workflow = require('../models/Workflow');
const { asyncHandler } = require('../../middleware/errorHandler');

/**
 * GET /analytics/overview - Get workflow analytics overview
 */
router.get('/overview', asyncHandler(async (req, res) => {
  const { startDate, endDate, workflowId } = req.query;

  const where = {};

  if (startDate && endDate) {
    where.created_at = {
      [Op.between]: [new Date(startDate), new Date(endDate)]
    };
  }

  if (workflowId) {
    where.workflow_id = workflowId;
  }

  // Execution statistics
  const stats = await WorkflowExecution.findAll({
    attributes: [
      'workflow_id',
      [sequelize.fn('COUNT', sequelize.col('id')), 'total_executions'],
      [sequelize.fn('AVG', sequelize.col('duration_ms')), 'avg_duration'],
      [sequelize.fn('MIN', sequelize.col('duration_ms')), 'min_duration'],
      [sequelize.fn('MAX', sequelize.col('duration_ms')), 'max_duration'],
      [sequelize.literal("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)"), 'successful'],
      [sequelize.literal("SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)"), 'failed'],
      [sequelize.literal("SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)"), 'cancelled']
    ],
    where,
    group: ['workflow_id'],
    raw: true
  });

  // Get workflow details
  const workflows = await Workflow.findAll({
    attributes: ['id', 'name'],
    raw: true
  });

  const workflowMap = Object.fromEntries(
    workflows.map(w => [w.id, w.name])
  );

  // Combine stats with workflow names
  const analytics = stats.map(stat => ({
    workflow_id: stat.workflow_id,
    workflow_name: workflowMap[stat.workflow_id] || 'Unknown',
    total_executions: parseInt(stat.total_executions),
    avg_duration: Math.round(parseFloat(stat.avg_duration) || 0),
    min_duration: parseInt(stat.min_duration) || 0,
    max_duration: parseInt(stat.max_duration) || 0,
    successful: parseInt(stat.successful) || 0,
    failed: parseInt(stat.failed) || 0,
    cancelled: parseInt(stat.cancelled) || 0,
    success_rate: parseInt(stat.total_executions) > 0
      ? ((parseInt(stat.successful) || 0) / parseInt(stat.total_executions) * 100).toFixed(2)
      : '0.00'
  }));

  res.json({
    success: true,
    data: {
      analytics,
      summary: {
        total_workflows: workflows.length,
        total_executions: analytics.reduce((sum, a) => sum + a.total_executions, 0),
        avg_success_rate: analytics.length > 0
          ? (analytics.reduce((sum, a) => sum + parseFloat(a.success_rate), 0) / analytics.length).toFixed(2)
          : '0.00'
      }
    }
  });
}));

/**
 * GET /analytics/trends - Get execution trends over time
 */
router.get('/trends', asyncHandler(async (req, res) => {
  const { workflowId, period = 'day', startDate, endDate } = req.query;

  const dateFormat = period === 'hour' ? 'YYYY-MM-DD HH24:00:00'
    : period === 'day' ? 'YYYY-MM-DD'
    : 'YYYY-MM';

  const where = {};
  if (workflowId) where.workflow_id = workflowId;

  if (startDate && endDate) {
    where.created_at = {
      [Op.between]: [new Date(startDate), new Date(endDate)]
    };
  }

  const trends = await WorkflowExecution.findAll({
    attributes: [
      [sequelize.fn('TO_CHAR', sequelize.col('created_at'), dateFormat), 'period'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.literal("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)"), 'successful'],
      [sequelize.literal("SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)"), 'failed']
    ],
    where,
    group: [sequelize.fn('TO_CHAR', sequelize.col('created_at'), dateFormat)],
    order: [[sequelize.fn('TO_CHAR', sequelize.col('created_at'), dateFormat), 'ASC']],
    raw: true
  });

  res.json({
    success: true,
    data: trends.map(t => ({
      period: t.period,
      total: parseInt(t.count),
      successful: parseInt(t.successful) || 0,
      failed: parseInt(t.failed) || 0,
      success_rate: parseInt(t.count) > 0
        ? ((parseInt(t.successful) || 0) / parseInt(t.count) * 100).toFixed(2)
        : '0.00'
    }))
  });
}));

/**
 * GET /analytics/workflow/:id - Get analytics for specific workflow
 */
router.get('/workflow/:id', asyncHandler(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);

  if (!workflow) {
    return res.status(404).json({
      success: false,
      error: 'Workflow not found'
    });
  }

  const { startDate, endDate } = req.query;

  const where = { workflow_id: req.params.id };

  if (startDate && endDate) {
    where.created_at = {
      [Op.between]: [new Date(startDate), new Date(endDate)]
    };
  }

  // Overall statistics
  const stats = await WorkflowExecution.findAll({
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
      [sequelize.fn('AVG', sequelize.col('duration_ms')), 'avg_duration'],
      [sequelize.fn('MIN', sequelize.col('duration_ms')), 'min_duration'],
      [sequelize.fn('MAX', sequelize.col('duration_ms')), 'max_duration'],
      [sequelize.literal("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)"), 'completed'],
      [sequelize.literal("SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)"), 'failed'],
      [sequelize.literal("SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)"), 'cancelled'],
      [sequelize.literal("SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END)"), 'running']
    ],
    where,
    raw: true
  });

  // Recent executions
  const recentExecutions = await WorkflowExecution.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: 10,
    attributes: ['id', 'status', 'duration_ms', 'created_at', 'completed_at']
  });

  const stat = stats[0];

  res.json({
    success: true,
    data: {
      workflow: {
        id: workflow.id,
        name: workflow.name
      },
      statistics: {
        total_executions: parseInt(stat.total) || 0,
        avg_duration_ms: Math.round(parseFloat(stat.avg_duration) || 0),
        min_duration_ms: parseInt(stat.min_duration) || 0,
        max_duration_ms: parseInt(stat.max_duration) || 0,
        completed: parseInt(stat.completed) || 0,
        failed: parseInt(stat.failed) || 0,
        cancelled: parseInt(stat.cancelled) || 0,
        running: parseInt(stat.running) || 0,
        success_rate: parseInt(stat.total) > 0
          ? ((parseInt(stat.completed) || 0) / parseInt(stat.total) * 100).toFixed(2)
          : '0.00'
      },
      recent_executions: recentExecutions
    }
  });
}));

module.exports = router;
