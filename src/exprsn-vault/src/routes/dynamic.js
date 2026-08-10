/**
 * Exprsn Vault - Dynamic Secrets Routes
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { requireToken, requireWrite } = require('../middleware/auth');
const dynamicService = require('../services/dynamicService');

// Validation schemas
const generateDatabaseSchema = Joi.object({
  path: Joi.string().min(1).required(),
  ttl: Joi.number().integer().min(60).max(86400).default(3600),
  maxTTL: Joi.number().integer().min(60).max(604800).default(86400),
  renewable: Joi.boolean().default(true),
  databaseType: Joi.string().valid('postgresql', 'mysql', 'mongodb').default('postgresql'),
  connection: Joi.object().optional()
});

const generateApiKeySchema = Joi.object({
  path: Joi.string().min(1).required(),
  ttl: Joi.number().integer().min(60).max(86400).default(3600),
  maxTTL: Joi.number().integer().min(60).max(604800).default(86400),
  renewable: Joi.boolean().default(true),
  prefix: Joi.string().min(1).max(10).default('vlt'),
  scopes: Joi.array().items(Joi.string()).default([])
});

const renewLeaseSchema = Joi.object({
  increment: Joi.number().integer().min(60).max(86400).optional()
});

// Generate database credentials
router.post('/database', requireWrite('/dynamic'), async (req, res) => {
  try {
    const actor = req.token?.actor || 'anonymous';

    // Validate input
    const { error, value } = generateDatabaseSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const lease = await dynamicService.generateDatabaseCredentials(value, actor);

    res.status(201).json({
      success: true,
      data: lease,
      message: 'Database credentials generated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate API key
router.post('/api-key', requireWrite('/dynamic'), async (req, res) => {
  try {
    const actor = req.token?.actor || 'anonymous';

    // Validate input
    const { error, value } = generateApiKeySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const lease = await dynamicService.generateApiKey(value, actor);

    res.status(201).json({
      success: true,
      data: lease,
      message: 'API key generated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// List leases
router.get('/leases', requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/dynamic' }), async (req, res) => {
  try {
    const { secretType, status, limit, offset } = req.query;

    const leases = await dynamicService.listLeases({
      secretType,
      status,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    res.json({
      success: true,
      data: leases,
      count: leases.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Renew lease
router.post('/leases/:leaseId/renew', requireWrite('/dynamic'), async (req, res) => {
  try {
    const { leaseId } = req.params;
    const actor = req.token?.actor || 'anonymous';

    // Validate input
    const { error, value } = renewLeaseSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const lease = await dynamicService.renewLease(leaseId, value.increment, actor);

    res.json({
      success: true,
      data: lease,
      message: 'Lease renewed successfully'
    });
  } catch (error) {
    const statusCode = error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
});

// Revoke lease
router.delete('/leases/:leaseId', requireWrite('/dynamic'), async (req, res) => {
  try {
    const { leaseId } = req.params;
    const actor = req.token?.actor || 'anonymous';

    await dynamicService.revokeLease(leaseId, actor);

    res.json({
      success: true,
      message: 'Lease revoked successfully'
    });
  } catch (error) {
    const statusCode = error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
