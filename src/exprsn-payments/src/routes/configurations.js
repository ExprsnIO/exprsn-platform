const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');
const { PaymentConfiguration } = require('../models');

// Validation schemas
const createConfigSchema = Joi.object({
  organizationId: Joi.string().uuid().allow(null),
  provider: Joi.string().valid('stripe', 'paypal', 'authorizenet').required(),
  isPrimary: Joi.boolean().default(false),
  credentials: Joi.object().required(),
  webhookSecret: Joi.string().allow(null, ''),
  settings: Joi.object().default({}),
  testMode: Joi.boolean().default(true),
  metadata: Joi.object().default({})
});

const updateConfigSchema = Joi.object({
  isActive: Joi.boolean(),
  isPrimary: Joi.boolean(),
  credentials: Joi.object(),
  webhookSecret: Joi.string().allow(null, ''),
  settings: Joi.object(),
  testMode: Joi.boolean(),
  metadata: Joi.object()
});

/**
 * GET /api/configurations
 * List payment configurations for the authenticated user
 */
router.get('/',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { organizationId, provider, isActive } = req.query;

    const where = {
      userId: req.user.id,
      organizationId: organizationId || null
    };

    if (provider) where.provider = provider;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const configurations = await PaymentConfiguration.findAll({
      where,
      attributes: { exclude: ['credentials'] }, // Don't send credentials
      order: [['isPrimary', 'DESC'], ['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: configurations
    });
  })
);

/**
 * GET /api/configurations/:id
 * Get a specific payment configuration
 */
router.get('/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const configuration = await PaymentConfiguration.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      attributes: { exclude: ['credentials'] }
    });

    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Payment configuration not found'
      });
    }

    res.json({
      success: true,
      data: configuration
    });
  })
);

/**
 * POST /api/configurations
 * Create a new payment configuration
 */
router.post('/',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createConfigSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    // Check if configuration already exists for this provider
    const existing = await PaymentConfiguration.findOne({
      where: {
        userId: req.user.id,
        organizationId: value.organizationId || null,
        provider: value.provider
      }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'CONFIGURATION_EXISTS',
        message: `Configuration for ${value.provider} already exists`
      });
    }

    // If this is set as primary, unset other primary configs
    if (value.isPrimary) {
      await PaymentConfiguration.update(
        { isPrimary: false },
        {
          where: {
            userId: req.user.id,
            organizationId: value.organizationId || null
          }
        }
      );
    }

    // Create configuration
    const configuration = await PaymentConfiguration.create({
      userId: req.user.id,
      ...value
    });

    // Return without credentials
    const result = configuration.toJSON();
    delete result.credentials;

    res.status(201).json({
      success: true,
      data: result
    });
  })
);

/**
 * PUT /api/configurations/:id
 * Update a payment configuration
 */
router.put('/:id',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = updateConfigSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const configuration = await PaymentConfiguration.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Payment configuration not found'
      });
    }

    // If setting as primary, unset other primary configs
    if (value.isPrimary) {
      await PaymentConfiguration.update(
        { isPrimary: false },
        {
          where: {
            userId: req.user.id,
            organizationId: configuration.organizationId
          }
        }
      );
    }

    // Update configuration
    await configuration.update(value);

    // Return without credentials
    const result = configuration.toJSON();
    delete result.credentials;

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * DELETE /api/configurations/:id
 * Delete a payment configuration
 */
router.delete('/:id',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    const configuration = await PaymentConfiguration.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Payment configuration not found'
      });
    }

    await configuration.destroy();

    res.json({
      success: true,
      message: 'Payment configuration deleted'
    });
  })
);

/**
 * POST /api/configurations/:id/set-primary
 * Set a configuration as primary
 */
router.post('/:id/set-primary',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const configuration = await PaymentConfiguration.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Payment configuration not found'
      });
    }

    // Unset other primary configs
    await PaymentConfiguration.update(
      { isPrimary: false },
      {
        where: {
          userId: req.user.id,
          organizationId: configuration.organizationId
        }
      }
    );

    // Set this as primary
    await configuration.update({ isPrimary: true });

    const result = configuration.toJSON();
    delete result.credentials;

    res.json({
      success: true,
      data: result
    });
  })
);

module.exports = router;
