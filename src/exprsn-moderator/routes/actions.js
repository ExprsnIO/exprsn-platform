/**
 * Moderation Actions Routes
 * Provides endpoints for moderation actions and history
 */

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const ModerationAction = require('../models/ModerationAction');
const ModerationCase = require('../models/ModerationCase');
const moderationActions = require('../services/moderationActions');
const logger = require('../utils/logger');

/**
 * GET /api/actions/recent
 * Get recent moderation actions
 * Query params: limit (default 10)
 */
router.get('/recent', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const actions = await ModerationAction.findAll({
      limit: parseInt(limit),
      order: [['created_at', 'DESC']],
      attributes: [
        'id',
        'action_type',
        'content_type',
        'content_id',
        'source_service',
        'reason',
        'moderator_id',
        'created_at',
        'metadata'
      ],
      raw: true
    });

    // Format actions for frontend
    const formattedActions = actions.map(action => ({
      id: action.id,
      actionType: action.action_type,
      contentType: action.content_type,
      contentId: action.content_id,
      sourceService: action.source_service,
      reason: action.reason || 'No reason provided',
      moderator: action.moderator_id || 'System',
      timestamp: action.created_at,
      metadata: action.metadata
    }));

    res.json({
      success: true,
      actions: formattedActions
    });
  } catch (error) {
    logger.error('Error fetching recent actions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent actions',
      message: error.message
    });
  }
});

/**
 * GET /api/actions/:id
 * Get specific action details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const action = await ModerationAction.findByPk(id);

    if (!action) {
      return res.status(404).json({
        success: false,
        error: 'Action not found'
      });
    }

    res.json({
      success: true,
      action
    });
  } catch (error) {
    logger.error('Error fetching action:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch action',
      message: error.message
    });
  }
});

/**
 * GET /api/actions/content/:contentType/:contentId
 * Get all actions for specific content
 */
router.get('/content/:contentType/:contentId', async (req, res) => {
  try {
    const { contentType, contentId } = req.params;

    const actions = await ModerationAction.findAll({
      where: {
        content_type: contentType,
        content_id: contentId
      },
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      actions
    });
  } catch (error) {
    logger.error('Error fetching content actions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch content actions',
      message: error.message
    });
  }
});

/**
 * POST /api/actions/execute
 * Execute a moderation action
 */
router.post('/execute', async (req, res) => {
  try {
    const {
      actionType,
      contentType,
      contentId,
      sourceService,
      userId,
      reason,
      moderatorId,
      metadata
    } = req.body;

    // Validate required fields
    if (!actionType || !contentType || !contentId || !sourceService) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: actionType, contentType, contentId, sourceService'
      });
    }

    // Execute the action
    const result = await moderationActions.executeAction({
      action: actionType,
      contentType,
      contentId,
      sourceService,
      userId,
      reason: reason || `Moderation action: ${actionType}`,
      moderatorId: moderatorId || 'system',
      metadata
    });

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('Error executing action:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute action',
      message: error.message
    });
  }
});

/**
 * GET /api/providers/status
 * Get AI provider availability status
 */
router.get('/providers/status', async (req, res) => {
  try {
    const config = require('../config');
    const providers = [];

    // Check Claude AI
    if (config.ai.claude.enabled && config.ai.claude.apiKey) {
      providers.push({
        name: 'Claude',
        available: true,
        model: config.ai.claude.model || 'claude-3-5-sonnet-20241022'
      });
    }

    // Check OpenAI
    if (config.ai.openai.enabled && config.ai.openai.apiKey) {
      providers.push({
        name: 'OpenAI',
        available: true,
        model: config.ai.openai.model || 'gpt-4'
      });
    }

    // Check DeepSeek
    if (config.ai.deepseek.enabled && config.ai.deepseek.apiKey) {
      providers.push({
        name: 'DeepSeek',
        available: true,
        model: config.ai.deepseek.model || 'deepseek-chat'
      });
    }

    // If no providers configured, add placeholder
    if (providers.length === 0) {
      providers.push({
        name: 'None',
        available: false,
        model: 'No AI providers configured'
      });
    }

    res.json({
      success: true,
      providers
    });
  } catch (error) {
    logger.error('Error fetching provider status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch provider status',
      message: error.message
    });
  }
});

module.exports = router;
