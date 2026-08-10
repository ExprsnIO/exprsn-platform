const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { asyncHandler } = require('@exprsn/shared');
const { Connection } = require('../models');
const { encrypt, decrypt } = require('../utils/encryption');
const connectionPoolManager = require('../services/ConnectionPoolManager');
const { authenticate, auditLogger, validateConnectionOwnership } = require('../middleware');

// Validation schemas
const createConnectionSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow('', null),
  host: Joi.string().required(),
  port: Joi.number().integer().min(1).max(65535).default(5432),
  database: Joi.string().required(),
  username: Joi.string().required(),
  password: Joi.string().required(),
  sslEnabled: Joi.boolean().default(false),
  color: Joi.string().pattern(/^#[0-9A-F]{6}$/i).default('#007bff')
});

/**
 * GET /api/connections
 * List all connections for the authenticated user
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user?.id || 'test-user'; // TODO: Get from token

  const connections = await Connection.findAll({
    where: { userId, isActive: true },
    order: [['name', 'ASC']],
    attributes: { exclude: ['password'] }
  });

  res.json({
    success: true,
    data: connections
  });
}));

/**
 * GET /api/connections/:id
 * Get a specific connection
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const userId = req.user?.id || 'test-user';
  const { id } = req.params;

  const connection = await Connection.findOne({
    where: { id, userId },
    attributes: { exclude: ['password'] }
  });

  if (!connection) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Connection not found'
    });
  }

  res.json({
    success: true,
    data: connection
  });
}));

/**
 * POST /api/connections
 * Create a new connection
 */
router.post('/', authenticate, auditLogger('CREATE_CONNECTION', 'connection'), asyncHandler(async (req, res) => {
  const userId = req.user?.id || 'test-user';

  // Validate input
  const { error, value } = createConnectionSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  // Encrypt password
  const encryptedPassword = encrypt(value.password);

  // Create connection
  const connection = await Connection.create({
    ...value,
    password: encryptedPassword,
    userId
  });

  // Return connection without password
  const responseData = connection.toJSON();
  delete responseData.password;

  res.status(201).json({
    success: true,
    data: responseData
  });
}));

/**
 * PUT /api/connections/:id
 * Update a connection
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const userId = req.user?.id || 'test-user';
  const { id } = req.params;

  const connection = await Connection.findOne({
    where: { id, userId }
  });

  if (!connection) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Connection not found'
    });
  }

  // Prepare update data
  const updateData = { ...req.body };

  // Encrypt password if provided
  if (updateData.password) {
    updateData.password = encrypt(updateData.password);
  }

  // Update connection
  await connection.update(updateData);

  // Close existing pool if connection details changed
  if (updateData.host || updateData.port || updateData.database || updateData.username || updateData.password) {
    await connectionPoolManager.closePool(connection);
  }

  // Return updated connection without password
  const responseData = connection.toJSON();
  delete responseData.password;

  res.json({
    success: true,
    data: responseData
  });
}));

/**
 * DELETE /api/connections/:id
 * Delete a connection
 */
router.delete('/:id', authenticate, validateConnectionOwnership, auditLogger('DELETE_CONNECTION', 'connection'), asyncHandler(async (req, res) => {
  const userId = req.user?.id || 'test-user';
  const { id } = req.params;

  const connection = await Connection.findOne({
    where: { id, userId }
  });

  if (!connection) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Connection not found'
    });
  }

  // Close pool
  await connectionPoolManager.closePool(connection);

  // Soft delete
  await connection.update({ isActive: false });

  res.json({
    success: true,
    message: 'Connection deleted successfully'
  });
}));

/**
 * POST /api/connections/:id/test
 * Test a database connection
 */
router.post('/:id/test', asyncHandler(async (req, res) => {
  const userId = req.user?.id || 'test-user';
  const { id } = req.params;

  const connection = await Connection.findOne({
    where: { id, userId },
    attributes: { include: ['password'] }
  });

  if (!connection) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Connection not found'
    });
  }

  // Build connection config
  const connectionConfig = {
    host: connection.host,
    port: connection.port,
    database: connection.database,
    username: connection.username,
    password: connection.password, // Already decrypted in getter
    sslEnabled: connection.sslEnabled
  };

  // Test connection
  const result = await connectionPoolManager.testConnection(connectionConfig);

  if (result.success) {
    // Update connection metadata
    await connection.update({
      pgVersion: result.version,
      lastConnectedAt: new Date()
    });

    res.json({
      success: true,
      data: {
        version: result.version,
        size: result.size,
        message: result.message
      }
    });
  } else {
    res.status(400).json({
      success: false,
      error: 'CONNECTION_FAILED',
      message: result.message
    });
  }
}));

module.exports = router;
