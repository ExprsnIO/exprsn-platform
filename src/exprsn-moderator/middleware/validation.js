/**
 * ═══════════════════════════════════════════════════════════
 * Validation Middleware
 * Request validation using Joi schemas
 * ═══════════════════════════════════════════════════════════
 */

const Joi = require('joi');
const logger = require('../src/utils/logger');

/**
 * Validate request middleware factory
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.warn('Validation failed', {
        path: req.path,
        errors
      });

      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        errors
      });
    }

    req.validatedBody = value;
    next();
  };
};

/**
 * Validation Schemas
 */

// Moderation request schema
const moderateContentSchema = Joi.object({
  contentType: Joi.string()
    .valid('text', 'image', 'video', 'audio', 'post', 'comment', 'message', 'profile', 'file')
    .required(),
  contentId: Joi.string()
    .max(255)
    .required(),
  sourceService: Joi.string()
    .max(100)
    .required(),
  userId: Joi.string()
    .uuid()
    .required(),
  contentText: Joi.string()
    .max(100000)
    .allow(null, ''),
  contentUrl: Joi.string()
    .uri()
    .allow(null, ''),
  contentMetadata: Joi.object()
    .default({}),
  aiProvider: Joi.string()
    .valid('claude', 'openai', 'deepseek', 'local')
    .optional()
}).or('contentText', 'contentUrl');

// Report submission schema
const reportSchema = Joi.object({
  contentType: Joi.string()
    .valid('text', 'image', 'video', 'audio', 'post', 'comment', 'message', 'profile', 'file')
    .required(),
  contentId: Joi.string()
    .max(255)
    .required(),
  sourceService: Joi.string()
    .max(100)
    .required(),
  reportedBy: Joi.string()
    .uuid()
    .required(),
  reason: Joi.string()
    .valid('spam', 'harassment', 'hate_speech', 'violence', 'nsfw', 'misinformation', 'copyright', 'personal_info', 'other')
    .required(),
  details: Joi.string()
    .max(5000)
    .allow(null, '')
});

// Rule creation schema
const ruleSchema = Joi.object({
  name: Joi.string()
    .max(255)
    .required(),
  description: Joi.string()
    .max(5000)
    .allow(null, ''),
  appliesTo: Joi.array()
    .items(Joi.string().valid('text', 'image', 'video', 'audio', 'post', 'comment', 'message', 'profile', 'file'))
    .optional(),
  sourceServices: Joi.array()
    .items(Joi.string().max(100))
    .optional(),
  conditions: Joi.object()
    .required(),
  thresholdScore: Joi.number()
    .integer()
    .min(0)
    .max(100)
    .optional(),
  action: Joi.string()
    .valid('auto_approve', 'approve', 'reject', 'hide', 'remove', 'warn', 'flag', 'escalate', 'require_review')
    .required(),
  enabled: Joi.boolean()
    .default(true),
  priority: Joi.number()
    .integer()
    .default(0)
});

// Appeal submission schema
const appealSchema = Joi.object({
  moderationItemId: Joi.string()
    .uuid()
    .optional(),
  userActionId: Joi.string()
    .uuid()
    .optional(),
  userId: Joi.string()
    .uuid()
    .optional(), // May come from auth
  reason: Joi.string()
    .max(5000)
    .required(),
  additionalInfo: Joi.string()
    .max(10000)
    .allow(null, '')
}).xor('moderationItemId', 'userActionId');

// Review decision schema
const reviewSchema = Joi.object({
  decision: Joi.string()
    .valid('approve', 'deny', 'reject')
    .required(),
  notes: Joi.string()
    .max(5000)
    .allow(null, '')
});

// User action schema
const userActionSchema = Joi.object({
  userId: Joi.string()
    .uuid()
    .required(),
  actionType: Joi.string()
    .valid('warn', 'suspend', 'ban', 'restrict', 'unsuspend', 'unban')
    .required(),
  reason: Joi.string()
    .max(5000)
    .required(),
  durationSeconds: Joi.number()
    .integer()
    .min(1)
    .optional(),
  relatedContentId: Joi.string()
    .max(255)
    .optional(),
  relatedReportId: Joi.string()
    .uuid()
    .optional(),
  performedBy: Joi.string()
    .uuid()
    .optional() // May come from auth
});

// Batch moderation schema
const batchModerateSchema = Joi.object({
  items: Joi.array()
    .items(moderateContentSchema)
    .min(1)
    .max(100)
    .required()
});

/**
 * Validation middleware exports
 */
module.exports = {
  validate,

  // Moderation
  validateModerateContent: validate(moderateContentSchema),
  validateBatchModerate: validate(batchModerateSchema),

  // Reports
  validateReport: validate(reportSchema),

  // Rules
  validateRule: validate(ruleSchema),

  // Appeals
  validateAppeal: validate(appealSchema),
  validateReview: validate(reviewSchema),

  // User actions
  validateUserAction: validate(userActionSchema),

  // Schemas (for external use)
  schemas: {
    moderateContentSchema,
    reportSchema,
    ruleSchema,
    appealSchema,
    reviewSchema,
    userActionSchema,
    batchModerateSchema
  }
};
