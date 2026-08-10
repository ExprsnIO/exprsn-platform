/**
 * Queries Routes
 */

const express = require('express');
const router = express.Router();
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const { Query } = require('../models');
const QueryEngine = require('../services/QueryEngine');
const Joi = require('joi');

// Validation schema
const createQuerySchema = Joi.object({
  dataSourceId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow('', null),
  queryType: Joi.string().valid('sql', 'rest', 'jsonlex', 'custom').required(),
  queryDefinition: Joi.object().required(),
  parameters: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    type: Joi.string().required(),
    defaultValue: Joi.any(),
    required: Joi.boolean()
  })),
  cacheEnabled: Joi.boolean(),
  cacheTTL: Joi.number().min(0),
  isPublic: Joi.boolean()
});

// List queries
router.get('/',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { dataSourceId, queryType, isPublic } = req.query;

    const where = {};
    if (dataSourceId) where.dataSourceId = dataSourceId;
    if (queryType) where.queryType = queryType;
    if (isPublic !== undefined) where.isPublic = isPublic;

    const queries = await Query.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: queries
    });
  })
);

// Get query by ID
router.get('/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const query = await Query.findByPk(req.params.id);

    if (!query) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Query not found'
      });
    }

    res.json({
      success: true,
      data: query
    });
  })
);

// Create query
router.post('/',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createQuerySchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const query = await Query.create({
      ...value,
      createdBy: req.user.id
    });

    res.status(201).json({
      success: true,
      data: query
    });
  })
);

// Execute query
router.post('/:id/execute',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { parameters, skipCache } = req.body;

    const result = await QueryEngine.execute(req.params.id, parameters || {}, { skipCache });

    res.json({
      success: true,
      data: result
    });
  })
);

// Clear query cache
router.post('/:id/clear-cache',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    await QueryEngine.clearCache(req.params.id);

    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  })
);

// Update query
router.put('/:id',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const query = await Query.findByPk(req.params.id);

    if (!query) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Query not found'
      });
    }

    await query.update({
      ...req.body,
      updatedBy: req.user.id
    });

    res.json({
      success: true,
      data: query
    });
  })
);

// Delete query
router.delete('/:id',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    const query = await Query.findByPk(req.params.id);

    if (!query) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Query not found'
      });
    }

    await query.destroy();

    res.json({
      success: true,
      message: 'Query deleted successfully'
    });
  })
);

module.exports = router;
