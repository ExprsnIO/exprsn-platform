/**
 * Poll Routes
 *
 * RESTful API endpoints for poll/survey management in the low-code platform.
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const pollService = require('../services/PollService');

// Mock user ID for development (replace with actual auth middleware)
const getCurrentUserId = (req) => req.user?.id || 'mock-user-id';

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const listPollsSchema = Joi.object({
  applicationId: Joi.string().uuid().optional(),
  formId: Joi.string().uuid().optional(),
  creatorId: Joi.string().uuid().optional(),
  pollType: Joi.string().valid('single-choice', 'multiple-choice', 'rating', 'ranking').optional(),
  status: Joi.string().valid('draft', 'active', 'closed', 'archived').optional(),
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('created_at', 'updated_at', 'question', 'response_count').default('created_at'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC'),
  search: Joi.string().max(255).optional()
});

const createPollSchema = Joi.object({
  applicationId: Joi.string().uuid().required(),
  formId: Joi.string().uuid().allow(null).optional(),
  question: Joi.string().min(1).max(1000).required(),
  description: Joi.string().max(10000).allow('', null).optional(),
  pollType: Joi.string().valid('single-choice', 'multiple-choice', 'rating', 'ranking').default('single-choice'),
  options: Joi.array().items(
    Joi.object({
      id: Joi.string().optional(),
      label: Joi.string().required(),
      value: Joi.any().optional(),
      order: Joi.number().optional()
    })
  ).min(2).required(),
  settings: Joi.object({
    allowAnonymous: Joi.boolean().default(true),
    allowMultipleResponses: Joi.boolean().default(false),
    showResults: Joi.string().valid('always', 'after-vote', 'after-close', 'never').default('after-vote'),
    requireComment: Joi.boolean().default(false)
  }).default(),
  startDate: Joi.date().iso().allow(null).optional(),
  endDate: Joi.date().iso().greater(Joi.ref('startDate')).allow(null).optional()
});

const updatePollSchema = Joi.object({
  question: Joi.string().min(1).max(1000).optional(),
  description: Joi.string().max(10000).allow('', null).optional(),
  pollType: Joi.string().valid('single-choice', 'multiple-choice', 'rating', 'ranking').optional(),
  options: Joi.array().items(
    Joi.object({
      id: Joi.string().optional(),
      label: Joi.string().required(),
      value: Joi.any().optional(),
      order: Joi.number().optional()
    })
  ).min(2).optional(),
  settings: Joi.object({
    allowAnonymous: Joi.boolean(),
    allowMultipleResponses: Joi.boolean(),
    showResults: Joi.string().valid('always', 'after-vote', 'after-close', 'never'),
    requireComment: Joi.boolean()
  }).optional(),
  startDate: Joi.date().iso().allow(null).optional(),
  endDate: Joi.date().iso().allow(null).optional()
}).min(1);

const addOptionSchema = Joi.object({
  label: Joi.string().required(),
  value: Joi.any().optional(),
  order: Joi.number().optional()
});

const submitResponseSchema = Joi.object({
  selectedOptions: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string()).min(1)
  ).required(),
  comment: Joi.string().max(5000).allow('', null).optional(),
  ipAddress: Joi.string().ip().optional(),
  userAgent: Joi.string().max(500).optional()
});

const getResponsesSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
  includeAnonymous: Joi.boolean().default(false)
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/polls
 * List all polls with filtering and pagination
 */
router.get('/', asyncHandler(async (req, res) => {
  const { error, value } = listPollsSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const result = await pollService.listPolls(value);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /api/polls/:id
 * Get poll by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);
  const includeResponses = req.query.includeResponses === 'true';

  const poll = await pollService.getPollById(id, {
    includeResponses,
    userId
  });

  res.json({
    success: true,
    data: poll
  });
}));

/**
 * POST /api/polls
 * Create new poll
 */
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = createPollSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const userId = getCurrentUserId(req);
  const poll = await pollService.createPoll(value, userId);

  res.status(201).json({
    success: true,
    data: poll,
    message: 'Poll created successfully'
  });
}));

/**
 * PUT /api/polls/:id
 * Update poll
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { error, value } = updatePollSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const poll = await pollService.updatePoll(id, value, userId);

  res.json({
    success: true,
    data: poll,
    message: 'Poll updated successfully'
  });
}));

/**
 * DELETE /api/polls/:id
 * Delete poll (soft delete)
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const result = await pollService.deletePoll(id, userId);

  res.json({
    success: true,
    message: result.message
  });
}));

/**
 * POST /api/polls/:id/activate
 * Activate poll
 */
router.post('/:id/activate', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const poll = await pollService.activatePoll(id, userId);

  res.json({
    success: true,
    data: poll,
    message: 'Poll activated successfully'
  });
}));

/**
 * POST /api/polls/:id/close
 * Close poll
 */
router.post('/:id/close', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const poll = await pollService.closePoll(id, userId);

  res.json({
    success: true,
    data: poll,
    message: 'Poll closed successfully'
  });
}));

/**
 * POST /api/polls/:id/archive
 * Archive poll
 */
router.post('/:id/archive', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const poll = await pollService.archivePoll(id, userId);

  res.json({
    success: true,
    data: poll,
    message: 'Poll archived successfully'
  });
}));

/**
 * POST /api/polls/:id/options
 * Add option to poll
 */
router.post('/:id/options', asyncHandler(async (req, res) => {
  const { error, value } = addOptionSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const poll = await pollService.addOption(id, value, userId);

  res.json({
    success: true,
    data: poll,
    message: 'Option added successfully'
  });
}));

/**
 * POST /api/polls/:id/respond
 * Submit poll response
 */
router.post('/:id/respond', asyncHandler(async (req, res) => {
  const { error, value } = submitResponseSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = req.user?.id || null; // Allow anonymous responses

  const response = await pollService.submitResponse(id, value, userId);

  res.status(201).json({
    success: true,
    data: response,
    message: 'Response submitted successfully'
  });
}));

/**
 * GET /api/polls/:id/results
 * Get poll results
 */
router.get('/:id/results', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const results = await pollService.getResults(id, userId);

  res.json({
    success: true,
    data: results
  });
}));

/**
 * POST /api/polls/:id/results/calculate
 * Recalculate poll results
 */
router.post('/:id/results/calculate', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const results = await pollService.calculateResults(id);

  res.json({
    success: true,
    data: results,
    message: 'Results calculated successfully'
  });
}));

/**
 * GET /api/polls/:id/responses
 * Get poll responses
 */
router.get('/:id/responses', asyncHandler(async (req, res) => {
  const { error, value } = getResponsesSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message
    });
  }

  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const result = await pollService.getResponses(id, userId, value);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /api/polls/:id/stats
 * Get poll statistics
 */
router.get('/:id/stats', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = getCurrentUserId(req);

  const stats = await pollService.getPollStats(id, userId);

  res.json({
    success: true,
    data: stats
  });
}));

// ============================================================================
// ERROR HANDLER
// ============================================================================

router.use((err, req, res, next) => {
  console.error('Poll API Error:', err);

  // Handle known errors
  if (err.message.includes('not found')) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: err.message
    });
  }

  if (err.message.includes('Unauthorized')) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: err.message
    });
  }

  if (err.message.includes('already exists') || err.message.includes('already responded')) {
    return res.status(409).json({
      success: false,
      error: 'CONFLICT',
      message: err.message
    });
  }

  if (err.message.includes('Poll is not active') ||
      err.message.includes('has not started') ||
      err.message.includes('has ended') ||
      err.message.includes('Cannot modify') ||
      err.message.includes('Cannot delete') ||
      err.message.includes('Cannot add options')) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_STATE',
      message: err.message
    });
  }

  if (err.message.includes('Results are not available')) {
    return res.status(403).json({
      success: false,
      error: 'RESULTS_UNAVAILABLE',
      message: err.message
    });
  }

  if (err.message.includes('Anonymous responses are not allowed') ||
      err.message.includes('Comment is required') ||
      err.message.includes('Invalid option')) {
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
