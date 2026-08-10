/**
 * Application Routes
 *
 * RESTful API endpoints for application management.
 * Enhanced with template and clone functionality.
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const ApplicationService = require('../services/ApplicationService');

// Middleware would be imported from @exprsn/shared in production
// For now, we'll create simple placeholders
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Validation schemas
const createApplicationSchema = Joi.object({
  name: Joi.string().min(1).max(255).required().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  displayName: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(10000).allow('', null),
  version: Joi.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
  icon: Joi.string().max(500).allow('', null),
  color: Joi.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#0078D4'),
  status: Joi.string().valid('draft', 'active', 'inactive', 'archived').default('draft'),
  settings: Joi.object().default({}),
  metadata: Joi.object().default({}),
  gitRepository: Joi.string().uri().allow('', null),
  gitBranch: Joi.string().max(255).default('main'),
});

const updateApplicationSchema = Joi.object({
  name: Joi.string().min(1).max(255).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  displayName: Joi.string().min(1).max(255),
  description: Joi.string().max(10000).allow('', null),
  icon: Joi.string().max(500).allow('', null),
  color: Joi.string().regex(/^#[0-9A-Fa-f]{6}$/),
  settings: Joi.object(),
  metadata: Joi.object(),
  gitRepository: Joi.string().uri().allow('', null),
  gitBranch: Joi.string().max(255),
});

const listApplicationsSchema = Joi.object({
  status: Joi.string().valid('draft', 'active', 'inactive', 'archived'),
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('name', 'displayName', 'created_at', 'updated_at').default('created_at'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC'),
  search: Joi.string().max(255).allow(''),
  includeEntities: Joi.boolean().default(false),
  includeForms: Joi.boolean().default(false),
  includeDataSources: Joi.boolean().default(false),
});

const cloneApplicationSchema = Joi.object({
  name: Joi.string().min(1).max(255).required().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  displayName: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(10000).allow('', null),
  version: Joi.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
  cloneOptions: Joi.object({
    entities: Joi.boolean().default(true),
    forms: Joi.boolean().default(true),
    data: Joi.boolean().default(false),
    workflows: Joi.boolean().default(false),
    permissions: Joi.boolean().default(false),
    dataSources: Joi.boolean().default(false),
    queries: Joi.boolean().default(false)
  }).default({}),
  overrides: Joi.object({
    color: Joi.string().regex(/^#[0-9A-Fa-f]{6}$/),
    icon: Joi.string().max(500),
    status: Joi.string().valid('draft', 'active', 'inactive', 'archived'),
    settings: Joi.object(),
    metadata: Joi.object(),
    gitRepository: Joi.string().uri().allow('', null),
    gitBranch: Joi.string().max(255)
  }).default({})
});

/**
 * @route   GET /lowcode/api/applications
 * @desc    List applications
 * @access  Private
 */
router.get('/', asyncHandler(async (req, res) => {
  const { error, value } = listApplicationsSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message,
    });
  }

  // In production, get userId from req.user (after CA token validation)
  const userId = req.user?.id || req.query.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const result = await ApplicationService.listApplications({
    ...value,
    ownerId: userId,
  });

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * @route   GET /lowcode/api/applications/:id
 * @desc    Get application by ID
 * @access  Private
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { includeEntities, includeForms, includeDataSources, includeGrids } = req.query;

  const application = await ApplicationService.getApplicationById(id, {
    includeEntities: includeEntities === 'true',
    includeForms: includeForms === 'true',
    includeDataSources: includeDataSources === 'true',
    includeGrids: includeGrids === 'true',
  });

  res.json({
    success: true,
    data: application,
  });
}));

/**
 * @route   POST /lowcode/api/applications
 * @desc    Create new application
 * @access  Private
 */
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = createApplicationSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message,
    });
  }

  // In production, get userId from req.user
  const userId = req.user?.id || req.body.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const application = await ApplicationService.createApplication(value, userId);

  // Emit Socket.IO event for real-time updates
  const io = req.app.get('io');
  if (io) {
    io.to('applications:' + userId).emit('application:created', application);
  }

  res.status(201).json({
    success: true,
    data: application,
    message: 'Application created successfully',
  });
}));

/**
 * @route   POST /lowcode/api/applications/:id/clone
 * @desc    Clone an existing application with a new version
 * @access  Private
 */
router.post('/:id/clone', asyncHandler(async (req, res) => {
  const { id: sourceId } = req.params;
  const { error, value } = cloneApplicationSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message,
    });
  }

  const userId = req.user?.id || req.body.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const clonedApp = await ApplicationService.cloneApplication(sourceId, value, userId);

  // Emit Socket.IO event for real-time updates
  const io = req.app.get('io');
  if (io) {
    io.to('applications:' + userId).emit('application:created', clonedApp);
  }

  res.status(201).json({
    success: true,
    data: clonedApp,
    message: 'Application cloned successfully',
  });
}));

/**
 * @route   PUT /lowcode/api/applications/:id
 * @desc    Update application
 * @access  Private
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = updateApplicationSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message,
    });
  }

  const userId = req.user?.id || req.body.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const application = await ApplicationService.updateApplication(id, value, userId);

  // Emit Socket.IO event for real-time updates
  const io = req.app.get('io');
  if (io) {
    io.to('applications:' + userId).emit('application:updated', application);
  }

  res.json({
    success: true,
    data: application,
    message: 'Application updated successfully',
  });
}));

/**
 * @route   DELETE /lowcode/api/applications/:id
 * @desc    Delete application
 * @access  Private
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id || req.query.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const result = await ApplicationService.deleteApplication(id, userId);

  // Emit Socket.IO event for real-time updates
  const io = req.app.get('io');
  if (io) {
    io.to('applications:' + userId).emit('application:deleted', id);
  }

  res.json({
    success: true,
    ...result,
  });
}));

/**
 * @route   POST /lowcode/api/applications/:id/publish
 * @desc    Publish application
 * @access  Private
 */
router.post('/:id/publish', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id || req.body.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const application = await ApplicationService.publishApplication(id, userId);

  res.json({
    success: true,
    data: application,
    message: 'Application published successfully',
  });
}));

/**
 * @route   POST /lowcode/api/applications/:id/archive
 * @desc    Archive application
 * @access  Private
 */
router.post('/:id/archive', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id || req.body.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const application = await ApplicationService.archiveApplication(id, userId);

  res.json({
    success: true,
    data: application,
    message: 'Application archived successfully',
  });
}));

/**
 * @route   POST /lowcode/api/applications/:id/version
 * @desc    Increment application version
 * @access  Private
 */
router.post('/:id/version', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type } = req.body; // major, minor, or patch

  if (!['major', 'minor', 'patch'].includes(type)) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Version type must be "major", "minor", or "patch"',
    });
  }

  const userId = req.user?.id || req.body.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const application = await ApplicationService.incrementVersion(id, type, userId);

  res.json({
    success: true,
    data: application,
    message: `Application version incremented to ${application.version}`,
  });
}));

/**
 * @route   GET /lowcode/api/applications/:id/stats
 * @desc    Get application statistics
 * @access  Private
 */
router.get('/:id/stats', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const stats = await ApplicationService.getApplicationStats(id);

  res.json({
    success: true,
    data: stats,
  });
}));

module.exports = router;
