/**
 * Validation Middleware
 * Request body and parameter validation using Joi
 */

const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * Validate request body against Joi schema
 * @param {Object} schema - Joi schema
 */
function validateBody(schema) {
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

      logger.warn('Validation failed:', { errors, body: req.body });

      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        errors
      });
    }

    req.body = value;
    next();
  };
}

/**
 * Validate query parameters against Joi schema
 * @param {Object} schema - Joi schema
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.warn('Query validation failed:', { errors, query: req.query });

      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Query parameter validation failed',
        errors
      });
    }

    req.query = value;
    next();
  };
}

/**
 * Validate route parameters against Joi schema
 * @param {Object} schema - Joi schema
 */
function validateParams(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.warn('Params validation failed:', { errors, params: req.params });

      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Parameter validation failed',
        errors
      });
    }

    req.params = value;
    next();
  };
}

// Common Joi schemas

const schemas = {
  // UUID validation
  uuid: Joi.string().uuid().required(),

  // Pagination
  pagination: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0)
  }),

  // Stream creation
  createStream: Joi.object({
    title: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(2000).allow('', null),
    visibility: Joi.string().valid('public', 'unlisted', 'private').default('public'),
    isRecording: Joi.boolean().default(true)
  }),

  // Stream update
  updateStream: Joi.object({
    title: Joi.string().min(1).max(255),
    description: Joi.string().max(2000).allow('', null),
    visibility: Joi.string().valid('public', 'unlisted', 'private')
  }).min(1),

  // Room creation
  createRoom: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(2000).allow('', null),
    maxParticipants: Joi.number().integer().min(2).max(50).default(10),
    isPrivate: Joi.boolean().default(false),
    password: Joi.string().min(4).max(100).when('isPrivate', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional().allow(null)
    }),
    settings: Joi.object({
      enableChat: Joi.boolean().default(true),
      enableScreenShare: Joi.boolean().default(true),
      enableRecording: Joi.boolean().default(false),
      muteOnJoin: Joi.boolean().default(false),
      videoOnJoin: Joi.boolean().default(true)
    }).default({})
  }),

  // Room update
  updateRoom: Joi.object({
    name: Joi.string().min(1).max(255),
    description: Joi.string().max(2000).allow('', null),
    maxParticipants: Joi.number().integer().min(2).max(50),
    settings: Joi.object({
      enableChat: Joi.boolean(),
      enableScreenShare: Joi.boolean(),
      enableRecording: Joi.boolean(),
      muteOnJoin: Joi.boolean(),
      videoOnJoin: Joi.boolean()
    })
  }).min(1),

  // Join room
  joinRoom: Joi.object({
    password: Joi.string().allow('', null),
    displayName: Joi.string().max(100).allow('', null),
    peerId: Joi.string().max(255).allow('', null)
  }),

  // Participant state update
  updateParticipantState: Joi.object({
    isAudioEnabled: Joi.boolean(),
    isVideoEnabled: Joi.boolean(),
    isScreenSharing: Joi.boolean(),
    peerId: Joi.string().max(255),
    connectionQuality: Joi.object({
      latency: Joi.number(),
      bandwidth: Joi.number(),
      packetLoss: Joi.number()
    })
  }).min(1),

  // List filters
  listStreams: Joi.object({
    status: Joi.string().valid('pending', 'live', 'ended', 'error'),
    visibility: Joi.string().valid('public', 'unlisted', 'private'),
    userId: Joi.string().uuid(),
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0)
  }),

  listRooms: Joi.object({
    status: Joi.string().valid('waiting', 'active', 'ended'),
    hostId: Joi.string().uuid(),
    isPrivate: Joi.boolean(),
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0)
  })
};

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
  schemas
};
