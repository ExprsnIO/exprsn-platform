const express = require('express');
const router = express.Router();
const { Workflow, WorkflowFavorite } = require('../models');
const { validateToken } = require('../middleware/auth');
const auditService = require('../services/auditService');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

/**
 * @route   POST /api/workflows/:id/favorite
 * @desc    Add workflow to user's favorites
 * @access  Private
 */
router.post('/:id/favorite', validateToken, async (req, res) => {
  try {
    const workflowId = req.params.id;
    const userId = req.user.id;

    // Check if workflow exists
    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    // Check if already favorited
    const existing = await WorkflowFavorite.findOne({
      where: {
        workflow_id: workflowId,
        user_id: userId
      }
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        data: {
          workflowId,
          favorited: true,
          message: 'Workflow is already in favorites'
        }
      });
    }

    // Add to favorites
    const favorite = await WorkflowFavorite.create({
      workflow_id: workflowId,
      user_id: userId
    });

    // Log audit event
    await auditService.log({
      eventType: 'workflow_favorite',
      workflowId,
      userId,
      success: true,
      metadata: {
        action: 'add',
        workflowName: workflow.name
      }
    });

    logger.info('Workflow favorited', {
      workflowId,
      userId
    });

    res.status(201).json({
      success: true,
      data: {
        workflowId,
        favorited: true,
        favoritedAt: favorite.created_at
      },
      message: 'Workflow added to favorites'
    });
  } catch (error) {
    logger.error('Failed to favorite workflow', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to favorite workflow'
    });
  }
});

/**
 * @route   DELETE /api/workflows/:id/favorite
 * @desc    Remove workflow from user's favorites
 * @access  Private
 */
router.delete('/:id/favorite', validateToken, async (req, res) => {
  try {
    const workflowId = req.params.id;
    const userId = req.user.id;

    const favorite = await WorkflowFavorite.findOne({
      where: {
        workflow_id: workflowId,
        user_id: userId
      }
    });

    if (!favorite) {
      return res.status(404).json({
        success: false,
        error: 'Workflow is not in favorites'
      });
    }

    await favorite.destroy();

    // Log audit event
    await auditService.log({
      eventType: 'workflow_unfavorite',
      workflowId,
      userId,
      success: true,
      metadata: {
        action: 'remove'
      }
    });

    logger.info('Workflow unfavorited', {
      workflowId,
      userId
    });

    res.json({
      success: true,
      data: {
        workflowId,
        favorited: false
      },
      message: 'Workflow removed from favorites'
    });
  } catch (error) {
    logger.error('Failed to unfavorite workflow', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to unfavorite workflow'
    });
  }
});

/**
 * @route   GET /api/workflows/:id/favorite/status
 * @desc    Check if workflow is in user's favorites
 * @access  Private
 */
router.get('/:id/favorite/status', validateToken, async (req, res) => {
  try {
    const workflowId = req.params.id;
    const userId = req.user.id;

    const favorite = await WorkflowFavorite.findOne({
      where: {
        workflow_id: workflowId,
        user_id: userId
      }
    });

    res.json({
      success: true,
      data: {
        workflowId,
        favorited: !!favorite,
        favoritedAt: favorite ? favorite.created_at : null
      }
    });
  } catch (error) {
    logger.error('Failed to check favorite status', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to check favorite status'
    });
  }
});

/**
 * @route   GET /api/workflows/favorites
 * @desc    Get user's favorite workflows
 * @access  Private
 */
router.get('/favorites', validateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const { count, rows } = await WorkflowFavorite.findAndCountAll({
      where: { user_id: userId },
      include: [
        {
          model: Workflow,
          as: 'workflow',
          required: true,
          attributes: [
            'id',
            'name',
            'description',
            'status',
            'trigger_type',
            'tags',
            'category',
            'execution_count',
            'success_count',
            'failure_count',
            'created_at',
            'updated_at'
          ]
        }
      ],
      limit: parseInt(limit, 10),
      offset,
      order: [[sortBy === 'name' ? { model: Workflow, as: 'workflow' } : sortBy, sortOrder]]
    });

    res.json({
      success: true,
      data: {
        favorites: rows.map(fav => ({
          ...fav.workflow.toJSON(),
          favoritedAt: fav.created_at
        })),
        pagination: {
          total: count,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(count / parseInt(limit, 10))
        }
      }
    });
  } catch (error) {
    logger.error('Failed to get favorite workflows', {
      error: error.message,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get favorite workflows'
    });
  }
});

/**
 * @route   GET /api/workflows/favorites/statistics
 * @desc    Get user's favorites statistics
 * @access  Private
 */
router.get('/favorites/statistics', validateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const totalFavorites = await WorkflowFavorite.count({
      where: { user_id: userId }
    });

    // Get favorites with workflow status
    const favorites = await WorkflowFavorite.findAll({
      where: { user_id: userId },
      include: [
        {
          model: Workflow,
          as: 'workflow',
          attributes: ['status', 'trigger_type', 'category']
        }
      ]
    });

    const byStatus = {};
    const byTriggerType = {};
    const byCategory = {};

    favorites.forEach(fav => {
      const workflow = fav.workflow;

      // Count by status
      byStatus[workflow.status] = (byStatus[workflow.status] || 0) + 1;

      // Count by trigger type
      byTriggerType[workflow.trigger_type] = (byTriggerType[workflow.trigger_type] || 0) + 1;

      // Count by category
      if (workflow.category) {
        byCategory[workflow.category] = (byCategory[workflow.category] || 0) + 1;
      }
    });

    res.json({
      success: true,
      data: {
        totalFavorites,
        byStatus,
        byTriggerType,
        byCategory
      }
    });
  } catch (error) {
    logger.error('Failed to get favorites statistics', {
      error: error.message,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get favorites statistics'
    });
  }
});

/**
 * @route   GET /api/workflows/:id/favorites/count
 * @desc    Get favorite count for a workflow (how many users favorited it)
 * @access  Private
 */
router.get('/:id/favorites/count', validateToken, async (req, res) => {
  try {
    const workflowId = req.params.id;

    // Check if workflow exists
    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    const count = await WorkflowFavorite.count({
      where: { workflow_id: workflowId }
    });

    res.json({
      success: true,
      data: {
        workflowId,
        favoriteCount: count
      }
    });
  } catch (error) {
    logger.error('Failed to get favorite count', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get favorite count'
    });
  }
});

module.exports = router;
