/**
 * ═══════════════════════════════════════════════════════════
 * Rules Routes
 * API endpoints for managing moderation rules
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { ModerationRule } = require('../models/sequelize-index');
const logger = require('../src/utils/logger');
const ruleEngineService = require('../services/ruleEngineService');

/**
 * GET /api/rules
 * List all moderation rules
 */
router.get('/', async (req, res) => {
  try {
    const {
      enabled,
      appliesTo,
      limit = 50,
      offset = 0
    } = req.query;

    const where = {};

    if (enabled !== undefined) {
      where.enabled = enabled === 'true';
    }

    if (appliesTo) {
      where.appliesTo = { [require('sequelize').Op.contains]: [appliesTo] };
    }

    const rules = await ModerationRule.findAll({
      where,
      order: [['priority', 'DESC'], ['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const total = await ModerationRule.count({ where });

    res.json({
      success: true,
      rules,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    logger.error('Failed to list rules', { error: error.message });
    res.status(500).json({
      error: 'FETCH_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/rules/:id
 * Get specific rule
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const rule = await ModerationRule.findByPk(id);

    if (!rule) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Rule not found'
      });
    }

    res.json({
      success: true,
      rule
    });
  } catch (error) {
    logger.error('Failed to get rule', { error: error.message });
    res.status(500).json({
      error: 'FETCH_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/rules
 * Create new moderation rule
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      description,
      appliesTo,
      sourceServices,
      conditions,
      thresholdScore,
      action,
      enabled = true,
      priority = 0
    } = req.body;

    // Validate required fields
    if (!name || !action || !conditions) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Missing required fields: name, action, conditions'
      });
    }

    // Create rule
    const rule = await ModerationRule.create({
      name,
      description,
      appliesTo,
      sourceServices,
      conditions,
      thresholdScore,
      action,
      enabled,
      priority,
      createdBy: req.user?.id // If auth middleware is used
    });

    logger.info('Rule created', {
      ruleId: rule.id,
      name: rule.name
    });

    res.status(201).json({
      success: true,
      rule
    });
  } catch (error) {
    logger.error('Failed to create rule', { error: error.message });
    res.status(500).json({
      error: 'CREATE_FAILED',
      message: error.message
    });
  }
});

/**
 * PUT /api/rules/:id
 * Update moderation rule
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      appliesTo,
      sourceServices,
      conditions,
      thresholdScore,
      action,
      enabled,
      priority
    } = req.body;

    const rule = await ModerationRule.findByPk(id);

    if (!rule) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Rule not found'
      });
    }

    // Update rule
    await rule.update({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(appliesTo !== undefined && { appliesTo }),
      ...(sourceServices !== undefined && { sourceServices }),
      ...(conditions !== undefined && { conditions }),
      ...(thresholdScore !== undefined && { thresholdScore }),
      ...(action !== undefined && { action }),
      ...(enabled !== undefined && { enabled }),
      ...(priority !== undefined && { priority })
    });

    logger.info('Rule updated', {
      ruleId: rule.id,
      name: rule.name
    });

    res.json({
      success: true,
      rule
    });
  } catch (error) {
    logger.error('Failed to update rule', { error: error.message });
    res.status(500).json({
      error: 'UPDATE_FAILED',
      message: error.message
    });
  }
});

/**
 * DELETE /api/rules/:id
 * Delete moderation rule
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const rule = await ModerationRule.findByPk(id);

    if (!rule) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Rule not found'
      });
    }

    const ruleName = rule.name;
    await rule.destroy();

    logger.info('Rule deleted', {
      ruleId: id,
      name: ruleName
    });

    res.json({
      success: true,
      message: 'Rule deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete rule', { error: error.message });
    res.status(500).json({
      error: 'DELETE_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/rules/:id/test
 * Test rule against sample content
 */
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const { contentType, contentText, riskScore, scores } = req.body;

    const rule = await ModerationRule.findByPk(id);

    if (!rule) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Rule not found'
      });
    }

    // Test rule evaluation
    const testContent = {
      contentType,
      contentText,
      sourceService: 'test'
    };

    const testScores = {
      riskScore,
      ...scores
    };

    const result = await ruleEngineService.evaluateRules(testContent, testScores);

    res.json({
      success: true,
      test: {
        rule: {
          id: rule.id,
          name: rule.name
        },
        matched: result.matched && result.rule?.id === id,
        result
      }
    });
  } catch (error) {
    logger.error('Failed to test rule', { error: error.message });
    res.status(500).json({
      error: 'TEST_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/rules/:id/enable
 * Enable rule
 */
router.post('/:id/enable', async (req, res) => {
  try {
    const { id } = req.params;

    const rule = await ModerationRule.findByPk(id);

    if (!rule) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Rule not found'
      });
    }

    await rule.update({ enabled: true });

    logger.info('Rule enabled', {
      ruleId: rule.id,
      name: rule.name
    });

    res.json({
      success: true,
      rule
    });
  } catch (error) {
    logger.error('Failed to enable rule', { error: error.message });
    res.status(500).json({
      error: 'ENABLE_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/rules/:id/disable
 * Disable rule
 */
router.post('/:id/disable', async (req, res) => {
  try {
    const { id } = req.params;

    const rule = await ModerationRule.findByPk(id);

    if (!rule) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Rule not found'
      });
    }

    await rule.update({ enabled: false });

    logger.info('Rule disabled', {
      ruleId: rule.id,
      name: rule.name
    });

    res.json({
      success: true,
      rule
    });
  } catch (error) {
    logger.error('Failed to disable rule', { error: error.message });
    res.status(500).json({
      error: 'DISABLE_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
