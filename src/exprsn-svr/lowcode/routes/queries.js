/**
 * ═══════════════════════════════════════════════════════════
 * Queries Routes - CRUD operations for visual queries
 * NOW WITH DATABASE PERSISTENCE (migrated from in-memory storage)
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const db = require('../models');

/**
 * Validation schema for query creation
 */
const createQuerySchema = Joi.object({
  name: Joi.string().pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(255).required(),
  displayName: Joi.string().max(255).required(),
  description: Joi.string().allow('', null),
  dataSourceId: Joi.string().uuid().allow(null).optional(),
  queryType: Joi.string().valid('visual', 'sql', 'function', 'rest').default('visual'),
  queryDefinition: Joi.object().optional().allow(null),
  rawSql: Joi.string().allow('', null).optional(),
  parameters: Joi.array().optional().default([]),
  resultTransform: Joi.string().allow('', null).optional(),
  cacheEnabled: Joi.boolean().optional().default(false),
  cacheTtl: Joi.number().integer().min(0).optional().allow(null),
  timeout: Joi.number().integer().min(1000).max(300000).optional().default(30000),
  status: Joi.string().valid('draft', 'active', 'inactive', 'deprecated').default('draft'),
  icon: Joi.string().max(100).optional().allow(null),
  color: Joi.string().max(20).optional().allow(null),
  metadata: Joi.object().optional().default({}),
});

/**
 * Validation schema for query updates
 */
const updateQuerySchema = Joi.object({
  name: Joi.string().pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(255).optional(),
  displayName: Joi.string().max(255).optional(),
  description: Joi.string().allow('', null).optional(),
  dataSourceId: Joi.string().uuid().allow(null).optional(),
  queryType: Joi.string().valid('visual', 'sql', 'function', 'rest').optional(),
  queryDefinition: Joi.object().optional().allow(null),
  rawSql: Joi.string().allow('', null).optional(),
  parameters: Joi.array().optional(),
  resultTransform: Joi.string().allow('', null).optional(),
  cacheEnabled: Joi.boolean().optional(),
  cacheTtl: Joi.number().integer().min(0).optional().allow(null),
  timeout: Joi.number().integer().min(1000).max(300000).optional(),
  status: Joi.string().valid('draft', 'active', 'inactive', 'deprecated').optional(),
  icon: Joi.string().max(100).optional().allow(null),
  color: Joi.string().max(20).optional().allow(null),
  metadata: Joi.object().optional(),
});

/**
 * GET /queries
 * List all queries for an application
 */
router.get('/', async (req, res) => {
  try {
    const { applicationId, appId, dataSourceId, queryType, status } = req.query;

    // Support both applicationId and appId for backward compatibility
    const actualAppId = applicationId || appId;

    if (!actualAppId) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'Application ID is required (use applicationId or appId parameter)',
      });
    }

    // Build where clause
    const where = { applicationId: actualAppId };
    if (dataSourceId) where.dataSourceId = dataSourceId;
    if (queryType) where.queryType = queryType;
    if (status) where.status = status;

    const queries = await db.Query.findAll({
      where,
      include: [
        {
          model: db.Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName'],
        },
        {
          model: db.DataSource,
          as: 'dataSource',
          attributes: ['id', 'name', 'displayName', 'sourceType'],
        },
      ],
      order: [['updatedAt', 'DESC']],
    });

    res.json({
      success: true,
      data: {
        queries,
        count: queries.length,
      },
    });
  } catch (error) {
    console.error('Failed to get queries:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /queries/:id
 * Get a single query by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = await db.Query.findByPk(id, {
      include: [
        {
          model: db.Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName'],
        },
        {
          model: db.DataSource,
          as: 'dataSource',
          attributes: ['id', 'name', 'displayName', 'sourceType', 'connectionConfig'],
        },
      ],
    });

    if (!query) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Query not found',
      });
    }

    res.json({
      success: true,
      data: query,
    });
  } catch (error) {
    console.error('Failed to get query:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /queries
 * Create a new query
 */
router.post('/', async (req, res) => {
  try {
    const { applicationId, ...queryData } = req.body;

    // Validate request
    const { error, value } = createQuerySchema.validate(queryData);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message,
      });
    }

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'applicationId is required',
      });
    }

    // Check if application exists
    const application = await db.Application.findByPk(applicationId);
    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Application not found',
      });
    }

    // If dataSourceId is provided, verify it exists
    if (value.dataSourceId) {
      const dataSource = await db.DataSource.findByPk(value.dataSourceId);
      if (!dataSource) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Data source not found',
        });
      }
    }

    // Create query
    const query = await db.Query.create({
      applicationId,
      ...value,
    });

    // Reload with associations
    await query.reload({
      include: [
        {
          model: db.Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName'],
        },
        {
          model: db.DataSource,
          as: 'dataSource',
          attributes: ['id', 'name', 'displayName', 'sourceType'],
        },
      ],
    });

    res.status(201).json({
      success: true,
      data: query,
      message: 'Query created successfully',
    });
  } catch (error) {
    console.error('Failed to create query:', error);

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_NAME',
        message: 'A query with this name already exists in this application',
      });
    }

    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: error.message,
    });
  }
});

/**
 * PUT /queries/:id
 * Update an existing query
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate request
    const { error, value } = updateQuerySchema.validate(updateData);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message,
      });
    }

    // Remove applicationId from updates (cannot change)
    delete value.applicationId;

    const query = await db.Query.findByPk(id);
    if (!query) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Query not found',
      });
    }

    // If updating dataSourceId, verify it exists
    if (value.dataSourceId) {
      const dataSource = await db.DataSource.findByPk(value.dataSourceId);
      if (!dataSource) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Data source not found',
        });
      }
    }

    // Update query
    await query.update(value);

    // Reload with associations
    await query.reload({
      include: [
        {
          model: db.Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName'],
        },
        {
          model: db.DataSource,
          as: 'dataSource',
          attributes: ['id', 'name', 'displayName', 'sourceType'],
        },
      ],
    });

    res.json({
      success: true,
      data: query,
      message: 'Query updated successfully',
    });
  } catch (error) {
    console.error('Failed to update query:', error);

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_NAME',
        message: 'A query with this name already exists in this application',
      });
    }

    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: error.message,
    });
  }
});

/**
 * DELETE /queries/:id
 * Delete a query (soft delete)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = await db.Query.findByPk(id);
    if (!query) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Query not found',
      });
    }

    // Soft delete
    await query.destroy();

    res.json({
      success: true,
      message: 'Query deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete query:', error);
    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /queries/:id/execute
 * Execute a query and return results
 */
router.post('/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const { parameters = {}, limit, offset } = req.body;

    const query = await db.Query.findByPk(id, {
      include: [
        {
          model: db.DataSource,
          as: 'dataSource',
        },
      ],
    });

    if (!query) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Query not found',
      });
    }

    if (query.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: 'Query must be in active status to execute',
      });
    }

    // Track execution
    await query.incrementExecutionCount();

    // Execute query based on type
    // (This would connect to QueryService for actual execution)
    // For now, return a placeholder response
    res.json({
      success: true,
      data: {
        queryId: id,
        executedAt: new Date().toISOString(),
        message: 'Query execution not yet implemented - QueryService integration pending',
        parameters,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Failed to execute query:', error);
    res.status(500).json({
      success: false,
      error: 'EXECUTION_FAILED',
      message: error.message,
    });
  }
});

module.exports = router;
