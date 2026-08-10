/**
 * Exprsn Herald - Validation Middleware
 * Request validation using Joi
 */

const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * Validate request body against a Joi schema
 */
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.warn('Validation error', {
        path: req.path,
        errors
      });

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace req.body with validated value
    req.body = value;
    next();
  };
}

/**
 * Validation schemas
 */

// Create notification schema
const createNotificationSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  type: Joi.string()
    .valid('info', 'success', 'warning', 'error', 'system')
    .default('info'),
  channel: Joi.string()
    .valid('push', 'email', 'sms', 'in-app')
    .default('in-app'),
  title: Joi.string().max(255).required(),
  body: Joi.string().required(),
  data: Joi.object().default({}),
  priority: Joi.string()
    .valid('low', 'normal', 'high', 'urgent')
    .default('normal'),
  expiresAt: Joi.date().iso().optional()
});

// Update preferences schema
const updatePreferencesSchema = Joi.object({
  email: Joi.object({
    enabled: Joi.boolean(),
    frequency: Joi.string().valid('realtime', 'digest', 'daily', 'weekly'),
    quietHours: Joi.object({
      start: Joi.number().integer().min(0).max(23),
      end: Joi.number().integer().min(0).max(23)
    }).optional()
  }).optional(),
  push: Joi.object({
    enabled: Joi.boolean(),
    frequency: Joi.string().valid('realtime', 'digest', 'daily', 'weekly'),
    quietHours: Joi.object({
      start: Joi.number().integer().min(0).max(23),
      end: Joi.number().integer().min(0).max(23)
    }).optional()
  }).optional(),
  sms: Joi.object({
    enabled: Joi.boolean(),
    frequency: Joi.string().valid('realtime', 'digest', 'daily', 'weekly'),
    quietHours: Joi.object({
      start: Joi.number().integer().min(0).max(23),
      end: Joi.number().integer().min(0).max(23)
    }).optional()
  }).optional(),
  'in-app': Joi.object({
    enabled: Joi.boolean(),
    frequency: Joi.string().valid('realtime', 'digest', 'daily', 'weekly'),
    quietHours: Joi.object({
      start: Joi.number().integer().min(0).max(23),
      end: Joi.number().integer().min(0).max(23)
    }).optional()
  }).optional()
}).min(1);

// Create template schema
const createTemplateSchema = Joi.object({
  name: Joi.string().max(100).required(),
  channel: Joi.string()
    .valid('push', 'email', 'sms', 'in-app')
    .required(),
  subject: Joi.string().max(255).optional(),
  body: Joi.string().required(),
  variables: Joi.array().items(Joi.string()).default([]),
  active: Joi.boolean().default(true)
});

// Update template schema
const updateTemplateSchema = Joi.object({
  name: Joi.string().max(100).optional(),
  channel: Joi.string()
    .valid('push', 'email', 'sms', 'in-app')
    .optional(),
  subject: Joi.string().max(255).optional(),
  body: Joi.string().optional(),
  variables: Joi.array().items(Joi.string()).optional(),
  active: Joi.boolean().optional()
}).min(1);

// Register device schema
const registerDeviceSchema = Joi.object({
  token: Joi.string().max(500).required(),
  platform: Joi.string().valid('ios', 'android', 'web').required(),
  deviceId: Joi.string().max(255).optional()
});

// Send test email schema
const sendTestEmailSchema = Joi.object({
  to: Joi.string().email().required(),
  templateName: Joi.string().optional()
});

// Send test SMS schema
const sendTestSMSSchema = Joi.object({
  to: Joi.string().required() // Phone number validation done in service
});

/**
 * Middleware functions
 */

const validateCreateNotification = validate(createNotificationSchema);
const validateUpdatePreferences = validate(updatePreferencesSchema);
const validateCreateTemplate = validate(createTemplateSchema);
const validateUpdateTemplate = validate(updateTemplateSchema);
const validateRegisterDevice = validate(registerDeviceSchema);
const validateSendTestEmail = validate(sendTestEmailSchema);
const validateSendTestSMS = validate(sendTestSMSSchema);

module.exports = {
  validate,
  validateCreateNotification,
  validateUpdatePreferences,
  validateCreateTemplate,
  validateUpdateTemplate,
  validateRegisterDevice,
  validateSendTestEmail,
  validateSendTestSMS,
  // Export schemas for reuse
  schemas: {
    createNotification: createNotificationSchema,
    updatePreferences: updatePreferencesSchema,
    createTemplate: createTemplateSchema,
    updateTemplate: updateTemplateSchema,
    registerDevice: registerDeviceSchema,
    sendTestEmail: sendTestEmailSchema,
    sendTestSMS: sendTestSMSSchema
  }
};
