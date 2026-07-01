/**
 * Moderation Actions Routes
 * Provides endpoints for moderation actions and history
 */

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
// Use the INITIALIZED Sequelize models (sequelize-index), not the raw factory
// functions in ../models/* — `require('../models/ModerationAction')` returns a
// `(sequelize) => Model` factory with no .findAll, so the legacy import 500'd.
const { ModerationAction, ModerationCase } = require('../models/sequelize-index');
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
      order: [['performedAt', 'DESC']]
    });

    // Format actions for frontend (model getters are camelCase; the table has
    // `action`/`performed_by`/`performed_at`, not action_type/moderator_id).
    const formattedActions = actions.map(action => ({
      id: action.id,
      actionType: action.action,
      contentType: action.contentType,
      contentId: action.contentId,
      sourceService: action.sourceService,
      reason: action.reason || 'No reason provided',
      moderator: action.performedBy || 'System',
      timestamp: action.performedAt,
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
      where: { contentType, contentId },
      order: [['performedAt', 'DESC']]
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
    const ai = config.ai || {};
    const providers = [];

    // Optional-chain each provider — config.ai may omit a provider key entirely
    // (e.g. no `deepseek`), which must not 500 the whole status endpoint.
    if (ai.claude && ai.claude.enabled && ai.claude.apiKey) {
      providers.push({ name: 'Claude', available: true, model: ai.claude.model || 'claude-3-5-sonnet-20241022' });
    }
    if (ai.openai && ai.openai.enabled && ai.openai.apiKey) {
      providers.push({ name: 'OpenAI', available: true, model: ai.openai.model || 'gpt-4' });
    }
    if (ai.deepseek && ai.deepseek.enabled && ai.deepseek.apiKey) {
      providers.push({ name: 'DeepSeek', available: true, model: ai.deepseek.model || 'deepseek-chat' });
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
