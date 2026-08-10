/**
 * Automation Routes
 * Business Rules and Decision Tables for the Low-Code Platform
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { requireLowCodeAdmin } = require('../middleware/caTokenAuth');
const AutomationService = require('../services/AutomationService');
const logger = require('../utils/logger');

// ============================================================================
// Validation Schemas
// ============================================================================

// Business Rule Schemas
const createBusinessRuleSchema = Joi.object({
  name: Joi.string().pattern(/^[a-zA-Z][a-zA-Z0-9_-]*$/).required()
    .messages({
      'string.pattern.base': 'Name must start with a letter and contain only letters, numbers, underscores, and hyphens'
    }),
  displayName: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow('', null).max(1000),
  ruleType: Joi.string().valid('condition', 'validation', 'transformation', 'calculation').required(),
  condition: Joi.string().required()
    .messages({
      'any.required': 'Condition expression is required'
    }),
  action: Joi.string().required()
    .messages({
      'any.required': 'Action expression is required'
    }),
  priority: Joi.number().integer().min(0).default(0),
  enabled: Joi.boolean().default(true),
  decisionTableId: Joi.string().uuid().allow(null)
});

const updateBusinessRuleSchema = Joi.object({
  displayName: Joi.string().min(1).max(255),
  description: Joi.string().allow('', null).max(1000),
  ruleType: Joi.string().valid('condition', 'validation', 'transformation', 'calculation'),
  condition: Joi.string(),
  action: Joi.string(),
  priority: Joi.number().integer().min(0),
  enabled: Joi.boolean(),
  decisionTableId: Joi.string().uuid().allow(null)
}).min(1);

const executeBusinessRuleSchema = Joi.object({
  inputData: Joi.object().required()
    .messages({
      'any.required': 'Input data is required for rule execution'
    })
});

// Decision Table Schemas
const createDecisionTableSchema = Joi.object({
  name: Joi.string().pattern(/^[a-zA-Z][a-zA-Z0-9_-]*$/).required()
    .messages({
      'string.pattern.base': 'Name must start with a letter and contain only letters, numbers, underscores, and hyphens'
    }),
  displayName: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow('', null).max(1000),
  inputs: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    label: Joi.string().required(),
    type: Joi.string().valid('string', 'number', 'boolean', 'date', 'object').required(),
    description: Joi.string().allow('', null)
  })).min(1).required()
    .messages({
      'array.min': 'At least one input is required'
    }),
  outputs: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    label: Joi.string().required(),
    type: Joi.string().valid('string', 'number', 'boolean', 'date', 'object').required(),
    description: Joi.string().allow('', null)
  })).min(1).required()
    .messages({
      'array.min': 'At least one output is required'
    }),
  rules: Joi.array().items(Joi.object({
    id: Joi.string().uuid(),
    conditions: Joi.object().required(),
    outputs: Joi.object().required(),
    priority: Joi.number().integer().min(0).default(0)
  })).default([]),
  hitPolicy: Joi.string().valid('first', 'unique', 'priority', 'any', 'collect').default('first'),
  defaultOutput: Joi.object().allow(null)
});

const updateDecisionTableSchema = Joi.object({
  displayName: Joi.string().min(1).max(255),
  description: Joi.string().allow('', null).max(1000),
  inputs: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    label: Joi.string().required(),
    type: Joi.string().valid('string', 'number', 'boolean', 'date', 'object').required(),
    description: Joi.string().allow('', null)
  })).min(1),
  outputs: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    label: Joi.string().required(),
    type: Joi.string().valid('string', 'number', 'boolean', 'date', 'object').required(),
    description: Joi.string().allow('', null)
  })).min(1),
  rules: Joi.array().items(Joi.object({
    id: Joi.string().uuid(),
    conditions: Joi.object().required(),
    outputs: Joi.object().required(),
    priority: Joi.number().integer().min(0).default(0)
  })),
  hitPolicy: Joi.string().valid('first', 'unique', 'priority', 'any', 'collect'),
  defaultOutput: Joi.object().allow(null)
}).min(1);

const addRuleSchema = Joi.object({
  conditions: Joi.object().required()
    .messages({
      'any.required': 'Rule conditions are required'
    }),
  outputs: Joi.object().required()
    .messages({
      'any.required': 'Rule outputs are required'
    }),
  priority: Joi.number().integer().min(0).default(0)
});

const executeDecisionTableSchema = Joi.object({
  inputData: Joi.object().required()
    .messages({
      'any.required': 'Input data is required for decision table execution'
    })
});

// ============================================================================
// Business Rules Routes
// ============================================================================

/**
 * List business rules for an application
 * GET /api/applications/:applicationId/rules
 */
router.get('/applications/:applicationId/rules', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { ruleType, enabled, decisionTableId, page = 1, limit = 50 } = req.query;

    const result = await AutomationService.listBusinessRules(applicationId, {
      ruleType,
      enabled: enabled !== undefined ? enabled === 'true' : undefined,
      decisionTableId,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('[Automation] Listed business rules', {
      applicationId,
      count: result.rules.length,
      userId: req.user.id
    });

    res.json(result);
  } catch (error) {
    logger.error('[Automation] Error listing business rules:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to list business rules'
    });
  }
});

/**
 * Create a business rule
 * POST /api/applications/:applicationId/rules
 */
router.post('/applications/:applicationId/rules', requireLowCodeAdmin, async (req, res) => {
  try {
    const { applicationId } = req.params;

    // Validate request body
    const { error, value } = createBusinessRuleSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message,
        details: error.details
      });
    }

    const result = await AutomationService.createBusinessRule(applicationId, value, req.user.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('[Automation] Business rule created', {
      ruleId: result.rule.id,
      applicationId,
      userId: req.user.id
    });

    res.status(201).json(result);
  } catch (error) {
    logger.error('[Automation] Error creating business rule:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to create business rule'
    });
  }
});

/**
 * Get a business rule by ID
 * GET /api/rules/:id
 */
router.get('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await AutomationService.getBusinessRule(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    logger.info('[Automation] Business rule retrieved', {
      ruleId: id,
      userId: req.user.id
    });

    res.json(result);
  } catch (error) {
    logger.error('[Automation] Error retrieving business rule:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve business rule'
    });
  }
});

/**
 * Update a business rule
 * PUT /api/rules/:id
 */
router.put('/rules/:id', requireLowCodeAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = updateBusinessRuleSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message,
        details: error.details
      });
    }

    const result = await AutomationService.updateBusinessRule(id, value, req.user.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('[Automation] Business rule updated', {
      ruleId: id,
      userId: req.user.id
    });

    res.json(result);
  } catch (error) {
    logger.error('[Automation] Error updating business rule:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to update business rule'
    });
  }
});

/**
 * Delete a business rule
 * DELETE /api/rules/:id
 */
router.delete('/rules/:id', requireLowCodeAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await AutomationService.deleteBusinessRule(id, req.user.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('[Automation] Business rule deleted', {
      ruleId: id,
      userId: req.user.id
    });

    res.json(result);
  } catch (error) {
    logger.error('[Automation] Error deleting business rule:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to delete business rule'
    });
  }
});

/**
 * Execute a business rule
 * POST /api/rules/:id/execute
 */
router.post('/rules/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = executeBusinessRuleSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message,
        details: error.details
      });
    }

    const result = await AutomationService.executeBusinessRule(id, value.inputData);

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('[Automation] Business rule executed', {
      ruleId: id,
      conditionMet: result.conditionMet,
      userId: req.user.id
    });

    res.json(result);
  } catch (error) {
    logger.error('[Automation] Error executing business rule:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to execute business rule'
    });
  }
});

// ============================================================================
// Decision Tables Routes
// ============================================================================

/**
 * List decision tables for an application
 * GET /api/applications/:applicationId/tables
 */
router.get('/applications/:applicationId/tables', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status, page = 1, limit = 50 } = req.query;

    const result = await AutomationService.listDecisionTables(applicationId, {
      status,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('[Automation] Listed decision tables', {
      applicationId,
      count: result.tables.length,
      userId: req.user.id
    });

    res.json(result);
  } catch (error) {
    logger.error('[Automation] Error listing decision tables:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to list decision tables'
    });
  }
});

/**
 * Create a decision table
 * POST /api/applications/:applicationId/tables
 */
router.post('/applications/:applicationId/tables', requireLowCodeAdmin, async (req, res) => {
  try {
    const { applicationId } = req.params;

    // Validate request body
    const { error, value } = createDecisionTableSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message,
        details: error.details
      });
    }

    const result = await AutomationService.createDecisionTable(applicationId, value, req.user.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('[Automation] Decision table created', {
      tableId: result.table.id,
      applicationId,
      userId: req.user.id
    });

    res.status(201).json(result);
  } catch (error) {
    logger.error('[Automation] Error creating decision table:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to create decision table'
    });
  }
});

/**
 * Get a decision table by ID
 * GET /api/tables/:id
 */
router.get('/tables/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await AutomationService.getDecisionTable(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    logger.info('[Automation] Decision table retrieved', {
      tableId: id,
      userId: req.user.id
    });

    res.json(result);
  } catch (error) {
    logger.error('[Automation] Error retrieving decision table:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve decision table'
    });
  }
});

/**
 * Update a decision table
 * PUT /api/tables/:id
 */
router.put('/tables/:id', requireLowCodeAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = updateDecisionTableSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message,
        details: error.details
      });
    }

    const result = await AutomationService.updateDecisionTable(id, value, req.user.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('[Automation] Decision table updated', {
      tableId: id,
      userId: req.user.id
    });

    res.json(result);
  } catch (error) {
    logger.error('[Automation] Error updating decision table:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to update decision table'
    });
  }
});

/**
 * Activate a decision table
 * POST /api/tables/:id/activate
 */
router.post('/tables/:id/activate', requireLowCodeAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await AutomationService.activateDecisionTable(id, req.user.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('[Automation] Decision table activated', {
      tableId: id,
      userId: req.user.id
    });

    res.json(result);
  } catch (error) {
    logger.error('[Automation] Error activating decision table:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to activate decision table'
    });
  }
});

/**
 * Deactivate a decision table
 * POST /api/tables/:id/deactivate
 */
router.post('/tables/:id/deactivate', requireLowCodeAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await AutomationService.deactivateDecisionTable(id, req.user.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('[Automation] Decision table deactivated', {
      tableId: id,
      userId: req.user.id
    });

    res.json(result);
  } catch (error) {
    logger.error('[Automation] Error deactivating decision table:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to deactivate decision table'
    });
  }
});

/**
 * Delete a decision table
 * DELETE /api/tables/:id
 */
router.delete('/tables/:id', requireLowCodeAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await AutomationService.deleteDecisionTable(id, req.user.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('[Automation] Decision table deleted', {
      tableId: id,
      userId: req.user.id
    });

    res.json(result);
  } catch (error) {
    logger.error('[Automation] Error deleting decision table:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to delete decision table'
    });
  }
});

/**
 * Add a rule to a decision table
 * POST /api/tables/:id/rules
 */
router.post('/tables/:id/rules', requireLowCodeAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = addRuleSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message,
        details: error.details
      });
    }

    const result = await AutomationService.addRule(id, value);

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('[Automation] Rule added to decision table', {
      tableId: id,
      ruleId: result.rule.id,
      userId: req.user.id
    });

    res.status(201).json(result);
  } catch (error) {
    logger.error('[Automation] Error adding rule to decision table:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to add rule to decision table'
    });
  }
});

/**
 * Remove a rule from a decision table
 * DELETE /api/tables/:id/rules/:ruleId
 */
router.delete('/tables/:id/rules/:ruleId', requireLowCodeAdmin, async (req, res) => {
  try {
    const { id, ruleId } = req.params;

    const result = await AutomationService.removeRule(id, ruleId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('[Automation] Rule removed from decision table', {
      tableId: id,
      ruleId,
      userId: req.user.id
    });

    res.json(result);
  } catch (error) {
    logger.error('[Automation] Error removing rule from decision table:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to remove rule from decision table'
    });
  }
});

/**
 * Execute a decision table
 * POST /api/tables/:id/execute
 */
router.post('/tables/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = executeDecisionTableSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message,
        details: error.details
      });
    }

    const result = await AutomationService.executeDecisionTable(id, value.inputData);

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('[Automation] Decision table executed', {
      tableId: id,
      matchedRules: result.matchedRules?.length || 0,
      userId: req.user.id
    });

    res.json(result);
  } catch (error) {
    logger.error('[Automation] Error executing decision table:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to execute decision table'
    });
  }
});

module.exports = router;
