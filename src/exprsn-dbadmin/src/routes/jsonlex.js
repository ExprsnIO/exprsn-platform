const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { asyncHandler } = require('@exprsn/shared');
const { Connection } = require('../models');
const JSONLexService = require('../services/JSONLexService');

/**
 * POST /api/jsonlex/query
 * Query JSON column using JSONata
 */
router.post('/query', asyncHandler(async (req, res) => {
  const schema = Joi.object({
    connectionId: Joi.string().uuid().required(),
    schema: Joi.string().required(),
    table: Joi.string().required(),
    jsonColumn: Joi.string().required(),
    expression: Joi.string().required(),
    where: Joi.string().allow(null),
    limit: Joi.number().integer().min(1).max(1000).default(100),
    offset: Joi.number().integer().min(0).default(0)
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const connection = await Connection.findByPk(value.connectionId);
  if (!connection) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Connection not found'
    });
  }

  const result = await JSONLexService.queryJSONColumn(
    connection,
    value.schema,
    value.table,
    value.jsonColumn,
    value.expression,
    {
      where: value.where,
      limit: value.limit,
      offset: value.offset
    }
  );

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
}));

/**
 * POST /api/jsonlex/update
 * Update JSON column using JSONata transformation
 */
router.post('/update', asyncHandler(async (req, res) => {
  const schema = Joi.object({
    connectionId: Joi.string().uuid().required(),
    schema: Joi.string().required(),
    table: Joi.string().required(),
    jsonColumn: Joi.string().required(),
    transform: Joi.string().required(),
    where: Joi.string().required()
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const connection = await Connection.findByPk(value.connectionId);
  if (!connection) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Connection not found'
    });
  }

  const result = await JSONLexService.updateJSONColumn(
    connection,
    value.schema,
    value.table,
    value.jsonColumn,
    value.transform,
    value.where
  );

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
}));

/**
 * POST /api/jsonlex/validate
 * Validate JSON data against schema
 */
router.post('/validate', asyncHandler(async (req, res) => {
  const { data, schema } = req.body;

  if (!data || !schema) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'data and schema are required'
    });
  }

  const result = await JSONLexService.validate(data, schema);

  res.json(result);
}));

/**
 * POST /api/jsonlex/infer-schema
 * Infer schema from sample JSON data
 */
router.post('/infer-schema', asyncHandler(async (req, res) => {
  const { data } = req.body;

  if (!data) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'data is required'
    });
  }

  const schema = JSONLexService.inferSchema(data);

  res.json({
    success: true,
    schema
  });
}));

/**
 * GET /api/jsonlex/stats/:connectionId/:schema/:table/:column
 * Get JSON column statistics
 */
router.get('/stats/:connectionId/:schema/:table/:column', asyncHandler(async (req, res) => {
  const { connectionId, schema, table, column } = req.params;

  const connection = await Connection.findByPk(connectionId);
  if (!connection) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Connection not found'
    });
  }

  const result = await JSONLexService.getJSONColumnStats(
    connection,
    schema,
    table,
    column
  );

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
}));

/**
 * POST /api/jsonlex/operator
 * Execute PostgreSQL JSON operator
 */
router.post('/operator', asyncHandler(async (req, res) => {
  const schema = Joi.object({
    connectionId: Joi.string().uuid().required(),
    schema: Joi.string().required(),
    table: Joi.string().required(),
    jsonColumn: Joi.string().required(),
    operator: Joi.string().valid('->>', '->', '#>', '#>>', '@>', '<@').required(),
    path: Joi.string().required(),
    where: Joi.string().allow(null),
    limit: Joi.number().integer().min(1).max(1000).default(100),
    offset: Joi.number().integer().min(0).default(0)
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const connection = await Connection.findByPk(value.connectionId);
  if (!connection) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Connection not found'
    });
  }

  const result = await JSONLexService.executeJSONOperator(
    connection,
    value.schema,
    value.table,
    value.jsonColumn,
    value.operator,
    value.path,
    {
      where: value.where,
      limit: value.limit,
      offset: value.offset
    }
  );

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
}));

module.exports = router;
