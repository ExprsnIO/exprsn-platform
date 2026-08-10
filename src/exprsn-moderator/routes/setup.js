/**
 * ═══════════════════════════════════════════════════════════
 * Setup Routes
 * Configuration and setup interface for moderator service
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { AIAgent, ModeratorConfig, EmailTemplate } = require('../models/sequelize-index');
const agentFramework = require('../services/agentFramework');
const emailService = require('../services/emailService');
const logger = require('../src/utils/logger');

// ═══════════════════════════════════════════════════════════
// Configuration Management
// ═══════════════════════════════════════════════════════════

/**
 * Get all configuration settings
 */
router.get('/config', async (req, res) => {
  try {
    const { category } = req.query;

    let configs;
    if (category) {
      configs = await ModeratorConfig.findAll({ where: { category } });
    } else {
      configs = await ModeratorConfig.findAll();
    }

    // Group by category
    const grouped = configs.reduce((acc, config) => {
      if (!acc[config.category]) {
        acc[config.category] = {};
      }
      acc[config.category][config.key] = {
        value: config.value,
        description: config.description,
        isSensitive: config.isSensitive,
        isSystem: config.isSystem
      };
      return acc;
    }, {});

    res.json({
      success: true,
      data: grouped
    });
  } catch (error) {
    logger.error('Failed to get config', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve configuration'
    });
  }
});

/**
 * Update configuration setting
 */
router.put('/config/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value, category, description } = req.body;

    const config = await ModeratorConfig.setConfig(
      key,
      value,
      category || 'general',
      req.user?.id
    );

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error('Failed to update config', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to update configuration'
    });
  }
});

// ═══════════════════════════════════════════════════════════
// AI Agents Management
// ═══════════════════════════════════════════════════════════

/**
 * Get all AI agents
 */
router.get('/agents', async (req, res) => {
  try {
    const agents = await AIAgent.findAll({
      order: [['priority', 'DESC'], ['name', 'ASC']]
    });

    res.json({
      success: true,
      data: agents
    });
  } catch (error) {
    logger.error('Failed to get agents', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve agents'
    });
  }
});

/**
 * Get agent by ID
 */
router.get('/agents/:id', async (req, res) => {
  try {
    const agent = await AIAgent.findByPk(req.params.id);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Agent not found'
      });
    }

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error('Failed to get agent', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve agent'
    });
  }
});

/**
 * Create new AI agent
 */
router.post('/agents', async (req, res) => {
  try {
    const agent = await AIAgent.create({
      ...req.body,
      createdBy: req.user?.id
    });

    // Reload agents in framework
    await agentFramework.reloadAgents();

    res.status(201).json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error('Failed to create agent', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to create agent'
    });
  }
});

/**
 * Update AI agent
 */
router.put('/agents/:id', async (req, res) => {
  try {
    const agent = await AIAgent.findByPk(req.params.id);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Agent not found'
      });
    }

    await agent.update(req.body);

    // Reload agents in framework
    await agentFramework.reloadAgents();

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error('Failed to update agent', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to update agent'
    });
  }
});

/**
 * Delete AI agent
 */
router.delete('/agents/:id', async (req, res) => {
  try {
    const agent = await AIAgent.findByPk(req.params.id);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Agent not found'
      });
    }

    await agent.destroy();

    // Reload agents in framework
    await agentFramework.reloadAgents();

    res.json({
      success: true,
      message: 'Agent deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete agent', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to delete agent'
    });
  }
});

/**
 * Get agent statistics
 */
router.get('/agents/stats', async (req, res) => {
  try {
    const stats = await agentFramework.getStatistics();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get agent stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve agent statistics'
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Email Templates Management
// ═══════════════════════════════════════════════════════════

/**
 * Get all email templates
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = await EmailTemplate.findAll({
      order: [['type', 'ASC'], ['name', 'ASC']]
    });

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    logger.error('Failed to get templates', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve templates'
    });
  }
});

/**
 * Create email template
 */
router.post('/templates', async (req, res) => {
  try {
    const template = await EmailTemplate.create({
      ...req.body,
      createdBy: req.user?.id
    });

    res.status(201).json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error('Failed to create template', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to create template'
    });
  }
});

/**
 * Update email template
 */
router.put('/templates/:id', async (req, res) => {
  try {
    const template = await EmailTemplate.findByPk(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Template not found'
      });
    }

    await template.update(req.body);

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error('Failed to update template', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to update template'
    });
  }
});

/**
 * Test email sending
 */
router.post('/test-email', async (req, res) => {
  try {
    const { to, templateType, data } = req.body;

    const result = await emailService.sendTemplateEmail({
      templateType,
      recipient: to,
      data
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to send test email', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to send test email'
    });
  }
});

// ═══════════════════════════════════════════════════════════
// System Health & Status
// ═══════════════════════════════════════════════════════════

/**
 * Get system status
 */
router.get('/status', async (req, res) => {
  try {
    const status = {
      service: 'exprsn-moderator',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      components: {
        database: await checkDatabase(),
        redis: await checkRedis(),
        email: await checkEmail(),
        agents: await checkAgents()
      }
    };

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Failed to get status', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve status'
    });
  }
});

// Helper functions for status checks
async function checkDatabase() {
  try {
    await AIAgent.count();
    return { status: 'healthy', message: 'Database connected' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
}

async function checkRedis() {
  // TODO: Implement Redis health check
  return { status: 'unknown', message: 'Redis check not implemented' };
}

async function checkEmail() {
  try {
    const result = await emailService.verify();
    return result.success
      ? { status: 'healthy', message: 'Email service configured' }
      : { status: 'unhealthy', message: result.error };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
}

async function checkAgents() {
  try {
    const stats = await agentFramework.getStatistics();
    return {
      status: 'healthy',
      message: `${stats.activeAgents} active agents`,
      stats
    };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
}

module.exports = router;
