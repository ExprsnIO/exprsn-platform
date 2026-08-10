/**
 * ═══════════════════════════════════════════════════════════
 * Decision Table Routes
 * API endpoints for decision table management and evaluation
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const decisionTableService = require('../services/DecisionTableService');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * GET /decision-tables - List decision tables
 */
router.get('/', asyncHandler(async (req, res) => {
  const { applicationId, status } = req.query;

  const where = {};
  if (applicationId) where.applicationId = applicationId;
  if (status) where.status = status;

  const tables = await decisionTableService.list(where);

  res.json({
    success: true,
    data: tables
  });
}));

/**
 * GET /decision-tables/:id - Get decision table
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const table = await decisionTableService.getById(req.params.id);

  if (!table) {
    return res.status(404).json({
      success: false,
      error: 'Decision table not found'
    });
  }

  res.json({
    success: true,
    data: table
  });
}));

/**
 * POST /decision-tables - Create decision table
 */
router.post('/', asyncHandler(async (req, res) => {
  const table = await decisionTableService.create(req.body);

  logger.info('Decision table created', { id: table.id, name: table.name });

  res.status(201).json({
    success: true,
    data: table
  });
}));

/**
 * PUT /decision-tables/:id - Update decision table
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const table = await decisionTableService.update(req.params.id, req.body);

  logger.info('Decision table updated', { id: table.id, name: table.name });

  res.json({
    success: true,
    data: table
  });
}));

/**
 * DELETE /decision-tables/:id - Delete decision table
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  await decisionTableService.delete(req.params.id);

  logger.info('Decision table deleted', { id: req.params.id });

  res.json({
    success: true,
    message: 'Decision table deleted'
  });
}));

/**
 * POST /decision-tables/:id/evaluate - Evaluate decision table
 */
router.post('/:id/evaluate', asyncHandler(async (req, res) => {
  const result = await decisionTableService.evaluate(req.params.id, req.body);

  logger.info('Decision table evaluated', {
    id: req.params.id,
    matched: result.matched,
    rulesMatched: result.matchedRules.length
  });

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /decision-tables/:id/activate - Activate decision table
 */
router.post('/:id/activate', asyncHandler(async (req, res) => {
  const table = await decisionTableService.getById(req.params.id);

  if (!table) {
    return res.status(404).json({
      success: false,
      error: 'Decision table not found'
    });
  }

  await table.activate();

  logger.info('Decision table activated', { id: table.id, name: table.name });

  res.json({
    success: true,
    data: table
  });
}));

/**
 * POST /decision-tables/:id/deactivate - Deactivate decision table
 */
router.post('/:id/deactivate', asyncHandler(async (req, res) => {
  const table = await decisionTableService.getById(req.params.id);

  if (!table) {
    return res.status(404).json({
      success: false,
      error: 'Decision table not found'
    });
  }

  await table.deactivate();

  logger.info('Decision table deactivated', { id: table.id, name: table.name });

  res.json({
    success: true,
    data: table
  });
}));

module.exports = router;
