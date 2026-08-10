/**
 * Exprsn Vault - Secrets Routes
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { asyncHandler, AppError, createRateLimiter } = require('@exprsn/shared');
const { requireToken, requireWrite, requireDelete, requireRead } = require('../middleware/auth');
const secretService = require('../services/secretService');

// Rate limiters for security-sensitive operations
const strictLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  keyPrefix: 'vault:strict'
});

const readLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per window
  keyPrefix: 'vault:read'
});

// Validation schemas
const createSecretSchema = Joi.object({
  key: Joi.string().min(1).max(255).required(),
  value: Joi.string().required(),
  encryptionKeyId: Joi.string().uuid().optional(),
  metadata: Joi.object().optional(),
  rotationPolicy: Joi.object().optional(),
  expiresAt: Joi.date().optional()
});

const updateSecretSchema = Joi.object({
  value: Joi.string().optional(),
  metadata: Joi.object().optional(),
  rotationPolicy: Joi.object().optional(),
  expiresAt: Joi.date().optional()
}).min(1);

// List secrets (metadata only)
router.get('/',
  readLimiter,
  ...requireRead('/secrets'),
  asyncHandler(async (req, res) => {
    const { pathPrefix, status, limit, offset } = req.query;
    const actor = req.user?.username || req.user?.id || 'service';

    const secrets = await secretService.listSecrets(
      {
        pathPrefix,
        status,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined
      },
      actor
    );

    res.json({
      success: true,
      data: secrets,
      count: secrets.length
    });
  })
);

// Get secret value
router.get('/:path(*)',
  readLimiter,
  ...requireRead('/secrets'),
  asyncHandler(async (req, res) => {
    const path = '/' + req.params.path;
    const actor = req.user?.username || req.user?.id || 'service';
    const includeValue = req.query.includeValue !== 'false';

    const secret = await secretService.getSecret(path, actor, includeValue);

    if (!secret) {
      throw new AppError(`Secret not found at path: ${path}`, 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: secret
    });
  })
);

// Store secret
router.post('/:path(*)',
  strictLimiter,
  ...requireWrite('/secrets'),
  asyncHandler(async (req, res) => {
    const path = '/' + req.params.path;
    const actor = req.user?.username || req.user?.id || 'service';

    // Validate input
    const { error, value } = createSecretSchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const secret = await secretService.createSecret(
      {
        path,
        ...value
      },
      actor
    );

    res.status(201).json({
      success: true,
      data: secret,
      message: 'Secret created successfully'
    });
  })
);

// Update secret
router.put('/:path(*)',
  strictLimiter,
  ...requireWrite('/secrets'),
  asyncHandler(async (req, res) => {
    const path = '/' + req.params.path;
    const actor = req.user?.username || req.user?.id || 'service';

    // Validate input
    const { error, value } = updateSecretSchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const secret = await secretService.updateSecret(path, value, actor);

    res.json({
      success: true,
      data: secret,
      message: 'Secret updated successfully'
    });
  })
);

// Delete secret
router.delete('/:path(*)',
  strictLimiter,
  ...requireDelete('/secrets'),
  asyncHandler(async (req, res) => {
    const path = '/' + req.params.path;
    const actor = req.user?.username || req.user?.id || 'service';

    await secretService.deleteSecret(path, actor);

    res.json({
      success: true,
      message: 'Secret deleted successfully'
    });
  })
);

// Rotate secret
router.post('/:path(*)/rotate',
  strictLimiter,
  ...requireWrite('/secrets'),
  asyncHandler(async (req, res) => {
    const path = '/' + req.params.path;
    const actor = req.user?.username || req.user?.id || 'service';
    const { newValue } = req.body;

    const secret = await secretService.rotateSecret(path, newValue, actor);

    res.json({
      success: true,
      data: secret,
      message: 'Secret rotated successfully'
    });
  })
);

module.exports = router;
