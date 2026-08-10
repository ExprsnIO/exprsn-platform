/**
 * Settings Routes
 *
 * RESTful API endpoints for application settings and variables management.
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { AppSetting, Application } = require('../models');
const SettingsService = require('../services/SettingsService');

// Initialize service
const settingsService = new SettingsService({ AppSetting, Application });

// Mock user ID for development (replace with actual auth middleware)
const getCurrentUserId = (req) => req.user?.id || 'mock-user-id';

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const getSettingsSchema = Joi.object({
  applicationId: Joi.string().uuid().required(),
  category: Joi.string().max(100).optional(),
  environment: Joi.string().valid('all', 'development', 'staging', 'production').optional(),
  includeSystem: Joi.boolean().default(true),
  onlyCustomizable: Joi.boolean().default(false)
});

const getSettingByKeySchema = Joi.object({
  applicationId: Joi.string().uuid().required(),
  environment: Joi.string().valid('all', 'development', 'staging', 'production').default('all')
});

const createSettingSchema = Joi.object({
  applicationId: Joi.string().uuid().required(),
  key: Joi.string().min(1).max(255).required().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  displayName: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(10000).allow('', null).optional(),
  category: Joi.string().max(100).default('general'),
  dataType: Joi.string().valid(
    'string', 'number', 'boolean', 'json', 'array',
    'date', 'datetime', 'password', 'url', 'email', 'color', 'file'
  ).default('string'),
  value: Joi.any().optional(),
  defaultValue: Joi.any().optional(),
  isUserCustomizable: Joi.boolean().default(true),
  isSystemSetting: Joi.boolean().default(false),
  isRequired: Joi.boolean().default(false),
  isEncrypted: Joi.boolean().default(false),
  environment: Joi.string().valid('all', 'development', 'staging', 'production').default('all'),
  validationRules: Joi.object().optional(),
  metadata: Joi.object().optional(),
  sortOrder: Joi.number().integer().default(0)
});

const updateSettingSchema = Joi.object({
  displayName: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(10000).allow('', null).optional(),
  category: Joi.string().max(100).optional(),
  dataType: Joi.string().valid(
    'string', 'number', 'boolean', 'json', 'array',
    'date', 'datetime', 'password', 'url', 'email', 'color', 'file'
  ).optional(),
  value: Joi.any().optional(),
  defaultValue: Joi.any().optional(),
  isUserCustomizable: Joi.boolean().optional(),
  isRequired: Joi.boolean().optional(),
  isEncrypted: Joi.boolean().optional(),
  validationRules: Joi.object().optional(),
  metadata: Joi.object().optional(),
  sortOrder: Joi.number().integer().optional(),
  isActive: Joi.boolean().optional()
}).min(1);

const updateSettingValueSchema = Joi.object({
  value: Joi.any().required()
});

const createDefaultSettingsSchema = Joi.object({
  applicationId: Joi.string().uuid().required()
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/settings
 * List all settings for an application with filtering
 */
router.get('/', asyncHandler(async (req, res) => {
  const { error, value } = getSettingsSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const settings = await settingsService.getSettings(value.applicationId, {
    category: value.category,
    environment: value.environment,
    includeSystem: value.includeSystem,
    onlyCustomizable: value.onlyCustomizable
  });

  res.json({
    success: true,
    data: settings
  });
}));

/**
 * GET /api/settings/object
 * Get settings as key-value object
 */
router.get('/object', asyncHandler(async (req, res) => {
  const schema = Joi.object({
    applicationId: Joi.string().uuid().required(),
    environment: Joi.string().valid('all', 'development', 'staging', 'production').default('all')
  });

  const { error, value } = schema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const settings = await settingsService.getSettingsAsObject(
    value.applicationId,
    value.environment
  );

  res.json({
    success: true,
    data: settings
  });
}));

/**
 * GET /api/settings/by-category
 * Get settings grouped by category
 */
router.get('/by-category', asyncHandler(async (req, res) => {
  const schema = Joi.object({
    applicationId: Joi.string().uuid().required(),
    environment: Joi.string().valid('all', 'development', 'staging', 'production').default('all')
  });

  const { error, value } = schema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const settings = await settingsService.getSettingsByCategory(
    value.applicationId,
    value.environment
  );

  res.json({
    success: true,
    data: settings
  });
}));

/**
 * GET /api/settings/key/:key
 * Get a specific setting by key
 */
router.get('/key/:key', asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { error, value } = getSettingByKeySchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const setting = await settingsService.getSettingByKey(
    value.applicationId,
    key,
    value.environment
  );

  if (!setting) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: `Setting '${key}' not found`
    });
  }

  res.json({
    success: true,
    data: setting
  });
}));

/**
 * GET /api/settings/:id
 * Get setting by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const setting = await AppSetting.findByPk(id);

  if (!setting) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Setting not found'
    });
  }

  const formatted = settingsService.formatSetting(setting);

  res.json({
    success: true,
    data: formatted
  });
}));

/**
 * POST /api/settings
 * Create new setting
 */
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = createSettingSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const userId = getCurrentUserId(req);
  const setting = await settingsService.createSetting(value, userId);

  res.status(201).json({
    success: true,
    data: setting,
    message: 'Setting created successfully'
  });
}));

/**
 * POST /api/settings/defaults
 * Create default settings for an application
 */
router.post('/defaults', asyncHandler(async (req, res) => {
  const { error, value } = createDefaultSettingsSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const userId = getCurrentUserId(req);
  const settings = await settingsService.createDefaultSettings(
    value.applicationId,
    userId
  );

  res.status(201).json({
    success: true,
    data: settings,
    message: `Created ${settings.length} default settings`
  });
}));

/**
 * PUT /api/settings/:id
 * Update setting
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { error, value } = updateSettingSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const setting = await settingsService.updateSetting(id, value, userId);

  res.json({
    success: true,
    data: setting,
    message: 'Setting updated successfully'
  });
}));

/**
 * PUT /api/settings/:id/value
 * Update setting value only
 */
router.put('/:id/value', asyncHandler(async (req, res) => {
  const { error, value } = updateSettingValueSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const setting = await settingsService.updateSettingValue(id, value.value, userId);

  res.json({
    success: true,
    data: setting,
    message: 'Setting value updated successfully'
  });
}));

/**
 * POST /api/settings/:id/reset
 * Reset setting to default value
 */
router.post('/:id/reset', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const setting = await settingsService.resetToDefault(id, userId);

  res.json({
    success: true,
    data: setting,
    message: 'Setting reset to default value'
  });
}));

/**
 * DELETE /api/settings/:id
 * Delete setting
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await settingsService.deleteSetting(id);

  res.json({
    success: true,
    message: 'Setting deleted successfully'
  });
}));

// ============================================================================
// ERROR HANDLER
// ============================================================================

router.use((err, req, res, next) => {
  console.error('Settings API Error:', err);

  // Handle known errors
  if (err.message.includes('not found')) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: err.message
    });
  }

  if (err.message.includes('cannot be modified') || err.message.includes('Cannot modify')) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: err.message
    });
  }

  if (err.message.includes('already exists')) {
    return res.status(409).json({
      success: false,
      error: 'CONFLICT',
      message: err.message
    });
  }

  if (err.message.includes('required') || err.message.includes('validation')) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: err.message
    });
  }

  // Generic error
  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: err.message || 'An unexpected error occurred'
  });
});

module.exports = router;
