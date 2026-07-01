/**
 * ═══════════════════════════════════════════════════════════
 * AI Agents Routes
 * Admin API endpoints for managing AI moderation agents
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { AIAgent } = require('../models/sequelize-index');
const logger = require('../src/utils/logger');
const requireAdmin = require('../src/middleware/requireAdmin');

// AI agents carry moderation policy/credentials — admin-only (read + write).
router.use(requireAdmin);

/**
 * GET /api/agents
 * List all AI agents (priority DESC)
 */
router.get('/', async (req, res) => {
  try {
    const agents = await AIAgent.findAll({
      order: [['priority', 'DESC'], ['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      agents
    });
  } catch (error) {
    logger.error('Failed to list agents', { error: error.message });
    res.status(500).json({
      error: 'FETCH_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/:id
 * Get specific agent
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await AIAgent.findByPk(id);

    if (!agent) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Agent not found'
      });
    }

    res.json({
      success: true,
      agent
    });
  } catch (error) {
    logger.error('Failed to get agent', { error: error.message });
    res.status(500).json({
      error: 'FETCH_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/agents
 * Create new AI agent
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      description,
      type,
      provider,
      model,
      promptTemplate,
      config,
      thresholdScores,
      appliesTo,
      priority,
      enabled,
      autoAction
    } = req.body;

    // Validate required fields
    if (!name || !type) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Missing required fields: name, type'
      });
    }

    const agent = await AIAgent.create({
      name,
      description,
      type,
      provider,
      model,
      promptTemplate,
      config,
      thresholdScores,
      appliesTo,
      priority,
      enabled,
      autoAction,
      createdBy: req.userId
    });

    logger.info('Agent created', {
      agentId: agent.id,
      name: agent.name
    });

    res.status(201).json({
      success: true,
      agent
    });
  } catch (error) {
    logger.error('Failed to create agent', { error: error.message });
    res.status(500).json({
      error: 'CREATE_FAILED',
      message: error.message
    });
  }
});

/**
 * PUT /api/agents/:id
 * Update AI agent (mutable fields only — never id/metrics)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      provider,
      model,
      promptTemplate,
      config,
      thresholdScores,
      appliesTo,
      priority,
      enabled,
      autoAction,
      status
    } = req.body;

    const agent = await AIAgent.findByPk(id);

    if (!agent) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Agent not found'
      });
    }

    await agent.update({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(provider !== undefined && { provider }),
      ...(model !== undefined && { model }),
      ...(promptTemplate !== undefined && { promptTemplate }),
      ...(config !== undefined && { config }),
      ...(thresholdScores !== undefined && { thresholdScores }),
      ...(appliesTo !== undefined && { appliesTo }),
      ...(priority !== undefined && { priority }),
      ...(enabled !== undefined && { enabled }),
      ...(autoAction !== undefined && { autoAction }),
      ...(status !== undefined && { status })
    });

    logger.info('Agent updated', {
      agentId: agent.id,
      name: agent.name
    });

    res.json({
      success: true,
      agent
    });
  } catch (error) {
    logger.error('Failed to update agent', { error: error.message });
    res.status(500).json({
      error: 'UPDATE_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/agents/:id/enable
 * Enable agent (enabled:true, status:'active')
 */
router.post('/:id/enable', async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await AIAgent.findByPk(id);

    if (!agent) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Agent not found'
      });
    }

    await agent.update({ enabled: true, status: 'active' });

    logger.info('Agent enabled', {
      agentId: agent.id,
      name: agent.name
    });

    res.json({
      success: true,
      agent
    });
  } catch (error) {
    logger.error('Failed to enable agent', { error: error.message });
    res.status(500).json({
      error: 'ENABLE_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/agents/:id/disable
 * Disable agent (enabled:false, status:'inactive')
 */
router.post('/:id/disable', async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await AIAgent.findByPk(id);

    if (!agent) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Agent not found'
      });
    }

    await agent.update({ enabled: false, status: 'inactive' });

    logger.info('Agent disabled', {
      agentId: agent.id,
      name: agent.name
    });

    res.json({
      success: true,
      agent
    });
  } catch (error) {
    logger.error('Failed to disable agent', { error: error.message });
    res.status(500).json({
      error: 'DISABLE_FAILED',
      message: error.message
    });
  }
});

/**
 * DELETE /api/agents/:id
 * Delete AI agent
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await AIAgent.findByPk(id);

    if (!agent) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Agent not found'
      });
    }

    const agentName = agent.name;
    await agent.destroy();

    logger.info('Agent deleted', {
      agentId: id,
      name: agentName
    });

    res.json({
      success: true,
      message: 'Agent deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete agent', { error: error.message });
    res.status(500).json({
      error: 'DELETE_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
