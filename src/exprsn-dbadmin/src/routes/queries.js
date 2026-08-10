const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { asyncHandler } = require('@exprsn/shared');
const { Connection, QueryHistory, SavedQuery } = require('../models');
const PostgreSQLService = require('../services/PostgreSQLService');

/**
 * POST /api/queries/execute
 * Execute a SQL query
 */
router.post('/execute', asyncHandler(async (req, res) => {
  const userId = req.user?.id || 'test-user';
  const { connectionId, query } = req.body;

  if (!connectionId || !query) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'connectionId and query are required'
    });
  }

  // Get connection
  const connection = await Connection.findOne({
    where: { id: connectionId, userId }
  });

  if (!connection) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Connection not found'
    });
  }

  const startTime = Date.now();

  try {
    // Execute query
    const result = await PostgreSQLService.executeRawQuery(connection, query);

    const executionTime = Date.now() - startTime;

    // Log to query history
    await QueryHistory.create({
      query,
      connectionId,
      userId,
      executionTimeMs: executionTime,
      rowsAffected: result.rowCount,
      status: 'success'
    });

    res.json({
      success: true,
      data: {
        rows: result.rows,
        rowCount: result.rowCount,
        fields: result.fields,
        command: result.command,
        executionTimeMs: executionTime
      }
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;

    // Log error to query history
    await QueryHistory.create({
      query,
      connectionId,
      userId,
      executionTimeMs: executionTime,
      status: 'error',
      errorMessage: error.message
    });

    res.status(400).json({
      success: false,
      error: 'QUERY_ERROR',
      message: error.message,
      code: error.code,
      position: error.position
    });
  }
}));

/**
 * POST /api/queries/explain
 * Get query execution plan
 */
router.post('/explain', asyncHandler(async (req, res) => {
  const userId = req.user?.id || 'test-user';
  const { connectionId, query, analyze = false } = req.body;

  const connection = await Connection.findOne({
    where: { id: connectionId, userId }
  });

  if (!connection) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Connection not found'
    });
  }

  try {
    const plan = await PostgreSQLService.explainQuery(connection, query, analyze);

    res.json({
      success: true,
      data: { plan }
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'QUERY_ERROR',
      message: error.message
    });
  }
}));

/**
 * GET /api/queries/history
 * Get query history
 */
router.get('/history', asyncHandler(async (req, res) => {
  const userId = req.user?.id || 'test-user';
  const { connectionId, limit = 50, offset = 0 } = req.query;

  const where = { userId };
  if (connectionId) {
    where.connectionId = connectionId;
  }

  const history = await QueryHistory.findAll({
    where,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['createdAt', 'DESC']],
    include: [{
      model: Connection,
      as: 'connection',
      attributes: ['id', 'name', 'host', 'database']
    }]
  });

  const total = await QueryHistory.count({ where });

  res.json({
    success: true,
    data: {
      history,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    }
  });
}));

/**
 * GET /api/queries/saved
 * List saved queries
 */
router.get('/saved', asyncHandler(async (req, res) => {
  const userId = req.user?.id || 'test-user';
  const { connectionId } = req.query;

  const where = { userId };
  if (connectionId) {
    where.connectionId = connectionId;
  }

  const savedQueries = await SavedQuery.findAll({
    where,
    order: [['name', 'ASC']],
    include: [{
      model: Connection,
      as: 'connection',
      attributes: ['id', 'name']
    }]
  });

  res.json({
    success: true,
    data: savedQueries
  });
}));

/**
 * POST /api/queries/saved
 * Save a query
 */
router.post('/saved', asyncHandler(async (req, res) => {
  const userId = req.user?.id || 'test-user';

  const schema = Joi.object({
    name: Joi.string().min(1).max(255).required(),
    description: Joi.string().allow('', null),
    query: Joi.string().required(),
    connectionId: Joi.string().uuid().required(),
    tags: Joi.array().items(Joi.string()).default([]),
    isShared: Joi.boolean().default(false)
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const savedQuery = await SavedQuery.create({
    ...value,
    userId
  });

  res.status(201).json({
    success: true,
    data: savedQuery
  });
}));

/**
 * PUT /api/queries/saved/:id
 * Update a saved query
 */
router.put('/saved/:id', asyncHandler(async (req, res) => {
  const userId = req.user?.id || 'test-user';
  const { id } = req.params;

  const savedQuery = await SavedQuery.findOne({
    where: { id, userId }
  });

  if (!savedQuery) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Saved query not found'
    });
  }

  await savedQuery.update(req.body);

  res.json({
    success: true,
    data: savedQuery
  });
}));

/**
 * DELETE /api/queries/saved/:id
 * Delete a saved query
 */
router.delete('/saved/:id', asyncHandler(async (req, res) => {
  const userId = req.user?.id || 'test-user';
  const { id } = req.params;

  const savedQuery = await SavedQuery.findOne({
    where: { id, userId }
  });

  if (!savedQuery) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Saved query not found'
    });
  }

  await savedQuery.destroy();

  res.json({
    success: true,
    message: 'Saved query deleted successfully'
  });
}));

module.exports = router;
