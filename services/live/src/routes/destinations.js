/**
 * Stream Destination Routes
 * API endpoints for managing streaming destinations (YouTube, Twitch, Facebook, etc.)
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateParams, validateQuery } = require('../middleware/validation');
const logger = require('../utils/logger');
const encryptionService = require('../services/encryption');
const { StreamDestination } = require('../models');

// Platform services
const youtubeService = require('../services/platforms/youtube');
const twitchService = require('../services/platforms/twitch');
const facebookService = require('../services/platforms/facebook');

/**
 * GET /api/destinations - List user's stream destinations
 */
router.get('/',
  requireAuth,
  validateQuery(Joi.object({
    stream_id: Joi.string().uuid().optional(),
    platform: Joi.string().valid('youtube', 'twitch', 'facebook', 'cloudflare', 'rtmp_custom').optional(),
    is_enabled: Joi.boolean().optional()
  })),
  async (req, res) => {
    try {
      const where = { user_id: req.user.id };

      if (req.query.stream_id) {
        where.stream_id = req.query.stream_id;
      }

      if (req.query.platform) {
        where.platform = req.query.platform;
      }

      if (req.query.is_enabled !== undefined) {
        where.is_enabled = req.query.is_enabled === 'true';
      }

      const destinations = await StreamDestination.findAll({
        where,
        order: [['created_at', 'DESC']],
        attributes: {
          exclude: ['access_token', 'refresh_token', 'stream_key']
        }
      });

      res.json({
        success: true,
        data: destinations
      });
    } catch (error) {
      logger.error('Failed to list destinations:', error);
      res.status(500).json({
        success: false,
        error: 'LIST_FAILED',
        message: 'Failed to list destinations'
      });
    }
  }
);

/**
 * GET /api/destinations/:id - Get destination details
 */
router.get('/:id',
  requireAuth,
  validateParams(Joi.object({
    id: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      const destination = await StreamDestination.findOne({
        where: {
          id: req.params.id,
          user_id: req.user.id
        },
        attributes: {
          exclude: ['access_token', 'refresh_token', 'stream_key']
        }
      });

      if (!destination) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Destination not found'
        });
      }

      res.json({
        success: true,
        data: destination
      });
    } catch (error) {
      logger.error('Failed to get destination:', error);
      res.status(500).json({
        success: false,
        error: 'GET_FAILED',
        message: 'Failed to get destination'
      });
    }
  }
);

/**
 * POST /api/destinations - Create a new destination
 */
router.post('/',
  requireAuth,
  validateBody(Joi.object({
    stream_id: Joi.string().uuid().required(),
    platform: Joi.string().valid('youtube', 'twitch', 'facebook', 'cloudflare', 'rtmp_custom').required(),
    name: Joi.string().min(1).max(255).required(),
    rtmp_url: Joi.string().uri().optional(),
    stream_key: Joi.string().optional(),
    access_token: Joi.string().optional(),
    refresh_token: Joi.string().optional(),
    token_expires_at: Joi.date().optional(),
    is_enabled: Joi.boolean().default(true),
    metadata: Joi.object().optional(),
    settings: Joi.object({
      bitrate: Joi.number().min(500).max(20000).default(4500),
      resolution: Joi.string().default('1920x1080'),
      framerate: Joi.number().min(15).max(60).default(30),
      auto_start: Joi.boolean().default(false),
      auto_reconnect: Joi.boolean().default(true),
      max_retries: Joi.number().min(0).max(10).default(3)
    }).optional()
  })),
  async (req, res) => {
    try {
      const data = {
        stream_id: req.body.stream_id,
        user_id: req.user.id,
        platform: req.body.platform,
        name: req.body.name,
        is_enabled: req.body.is_enabled !== undefined ? req.body.is_enabled : true,
        metadata: req.body.metadata || {},
        settings: req.body.settings || {}
      };

      // Encrypt sensitive fields
      if (req.body.stream_key) {
        data.stream_key = encryptionService.encrypt(req.body.stream_key);
      }

      if (req.body.access_token) {
        data.access_token = encryptionService.encrypt(req.body.access_token);
      }

      if (req.body.refresh_token) {
        data.refresh_token = encryptionService.encrypt(req.body.refresh_token);
      }

      if (req.body.token_expires_at) {
        data.token_expires_at = req.body.token_expires_at;
      }

      if (req.body.rtmp_url) {
        data.rtmp_url = req.body.rtmp_url;
      }

      const destination = await StreamDestination.create(data);

      logger.info('Destination created', {
        destinationId: destination.id,
        userId: req.user.id,
        platform: destination.platform
      });

      // Return without sensitive fields
      const response = destination.toJSON();
      delete response.access_token;
      delete response.refresh_token;
      delete response.stream_key;

      res.status(201).json({
        success: true,
        data: response
      });
    } catch (error) {
      logger.error('Failed to create destination:', error);
      res.status(500).json({
        success: false,
        error: 'CREATE_FAILED',
        message: error.message || 'Failed to create destination'
      });
    }
  }
);

/**
 * PUT /api/destinations/:id - Update destination
 */
router.put('/:id',
  requireAuth,
  validateParams(Joi.object({
    id: Joi.string().uuid().required()
  })),
  validateBody(Joi.object({
    name: Joi.string().min(1).max(255).optional(),
    is_enabled: Joi.boolean().optional(),
    metadata: Joi.object().optional(),
    settings: Joi.object({
      bitrate: Joi.number().min(500).max(20000).optional(),
      resolution: Joi.string().optional(),
      framerate: Joi.number().min(15).max(60).optional(),
      auto_start: Joi.boolean().optional(),
      auto_reconnect: Joi.boolean().optional(),
      max_retries: Joi.number().min(0).max(10).optional()
    }).optional()
  })),
  async (req, res) => {
    try {
      const destination = await StreamDestination.findOne({
        where: {
          id: req.params.id,
          user_id: req.user.id
        }
      });

      if (!destination) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Destination not found'
        });
      }

      // Check if destination is currently streaming
      if (destination.status === 'live' || destination.status === 'connecting') {
        return res.status(400).json({
          success: false,
          error: 'DESTINATION_ACTIVE',
          message: 'Cannot update destination while streaming'
        });
      }

      await destination.update(req.body);

      logger.info('Destination updated', {
        destinationId: destination.id,
        userId: req.user.id
      });

      // Return without sensitive fields
      const response = destination.toJSON();
      delete response.access_token;
      delete response.refresh_token;
      delete response.stream_key;

      res.json({
        success: true,
        data: response
      });
    } catch (error) {
      logger.error('Failed to update destination:', error);
      res.status(500).json({
        success: false,
        error: 'UPDATE_FAILED',
        message: error.message || 'Failed to update destination'
      });
    }
  }
);

/**
 * DELETE /api/destinations/:id - Delete destination
 */
router.delete('/:id',
  requireAuth,
  validateParams(Joi.object({
    id: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      const destination = await StreamDestination.findOne({
        where: {
          id: req.params.id,
          user_id: req.user.id
        }
      });

      if (!destination) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Destination not found'
        });
      }

      // Check if destination is currently streaming
      if (destination.status === 'live' || destination.status === 'connecting') {
        return res.status(400).json({
          success: false,
          error: 'DESTINATION_ACTIVE',
          message: 'Cannot delete destination while streaming'
        });
      }

      await destination.destroy();

      logger.info('Destination deleted', {
        destinationId: req.params.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Destination deleted'
      });
    } catch (error) {
      logger.error('Failed to delete destination:', error);
      res.status(500).json({
        success: false,
        error: 'DELETE_FAILED',
        message: error.message || 'Failed to delete destination'
      });
    }
  }
);

/**
 * GET /api/destinations/platforms/:platform/auth-url - Get OAuth authorization URL
 */
router.get('/platforms/:platform/auth-url',
  requireAuth,
  validateParams(Joi.object({
    platform: Joi.string().valid('youtube', 'twitch', 'facebook').required()
  })),
  validateQuery(Joi.object({
    state: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const { platform } = req.params;
      const state = req.query.state || encryptionService.generateToken(16);

      let authUrl;

      switch (platform) {
        case 'youtube':
          authUrl = youtubeService.getAuthorizationUrl(state);
          break;

        case 'twitch':
          authUrl = twitchService.getAuthorizationUrl(state);
          break;

        case 'facebook':
          authUrl = facebookService.getAuthorizationUrl(state);
          break;

        default:
          return res.status(400).json({
            success: false,
            error: 'INVALID_PLATFORM',
            message: 'Invalid platform'
          });
      }

      res.json({
        success: true,
        data: {
          authUrl,
          state
        }
      });
    } catch (error) {
      logger.error('Failed to get auth URL:', error);
      res.status(500).json({
        success: false,
        error: 'AUTH_URL_FAILED',
        message: 'Failed to get authorization URL'
      });
    }
  }
);

/**
 * POST /api/destinations/platforms/:platform/exchange-token - Exchange OAuth code for tokens
 */
router.post('/platforms/:platform/exchange-token',
  requireAuth,
  validateParams(Joi.object({
    platform: Joi.string().valid('youtube', 'twitch', 'facebook').required()
  })),
  validateBody(Joi.object({
    code: Joi.string().required(),
    stream_id: Joi.string().uuid().required(),
    name: Joi.string().min(1).max(255).required()
  })),
  async (req, res) => {
    try {
      const { platform } = req.params;
      const { code, stream_id, name } = req.body;

      let tokens;

      switch (platform) {
        case 'youtube':
          tokens = await youtubeService.exchangeCodeForToken(code);
          break;

        case 'twitch':
          tokens = await twitchService.exchangeCodeForToken(code);
          break;

        case 'facebook':
          tokens = await facebookService.exchangeCodeForToken(code);
          // Get long-lived token
          tokens = await facebookService.getLongLivedToken(tokens.accessToken);
          break;

        default:
          return res.status(400).json({
            success: false,
            error: 'INVALID_PLATFORM',
            message: 'Invalid platform'
          });
      }

      // Calculate token expiry
      const expiresAt = new Date(Date.now() + (tokens.expiresIn * 1000));

      // Create destination
      const destination = await StreamDestination.create({
        stream_id,
        user_id: req.user.id,
        platform,
        name,
        access_token: encryptionService.encrypt(tokens.accessToken),
        refresh_token: tokens.refreshToken ?
          encryptionService.encrypt(tokens.refreshToken) : null,
        token_expires_at: expiresAt,
        is_enabled: true
      });

      logger.info('OAuth tokens exchanged and destination created', {
        destinationId: destination.id,
        userId: req.user.id,
        platform
      });

      // Return without sensitive fields
      const response = destination.toJSON();
      delete response.access_token;
      delete response.refresh_token;
      delete response.stream_key;

      res.status(201).json({
        success: true,
        data: response
      });
    } catch (error) {
      logger.error('Failed to exchange token:', error);
      res.status(500).json({
        success: false,
        error: 'TOKEN_EXCHANGE_FAILED',
        message: error.message || 'Failed to exchange authorization code'
      });
    }
  }
);

/**
 * POST /api/destinations/:id/test-connection - Test destination connection
 */
router.post('/:id/test-connection',
  requireAuth,
  validateParams(Joi.object({
    id: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      const destination = await StreamDestination.findOne({
        where: {
          id: req.params.id,
          user_id: req.user.id
        }
      });

      if (!destination) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Destination not found'
        });
      }

      // Platform-specific connection test
      let testResult = { success: false, message: 'Test not implemented' };

      const accessToken = destination.access_token ?
        encryptionService.decrypt(destination.access_token) : null;

      switch (destination.platform) {
        case 'youtube':
          if (accessToken) {
            try {
              // Test by getting user info or channel info
              const client = youtubeService.createClient(accessToken);
              await client.get('/channels', {
                params: { part: 'snippet', mine: true }
              });
              testResult = { success: true, message: 'YouTube connection successful' };
            } catch (error) {
              testResult = { success: false, message: `YouTube error: ${error.message}` };
            }
          }
          break;

        case 'twitch':
          if (accessToken) {
            try {
              await twitchService.getUser(accessToken);
              testResult = { success: true, message: 'Twitch connection successful' };
            } catch (error) {
              testResult = { success: false, message: `Twitch error: ${error.message}` };
            }
          }
          break;

        case 'facebook':
          if (accessToken) {
            try {
              await facebookService.getUserPages(accessToken);
              testResult = { success: true, message: 'Facebook connection successful' };
            } catch (error) {
              testResult = { success: false, message: `Facebook error: ${error.message}` };
            }
          }
          break;

        case 'cloudflare':
          testResult = { success: true, message: 'Cloudflare configured' };
          break;

        case 'rtmp_custom':
          if (destination.rtmp_url) {
            testResult = { success: true, message: 'Custom RTMP URL configured' };
          }
          break;
      }

      res.json({
        success: true,
        data: testResult
      });
    } catch (error) {
      logger.error('Failed to test connection:', error);
      res.status(500).json({
        success: false,
        error: 'TEST_FAILED',
        message: error.message || 'Failed to test connection'
      });
    }
  }
);

module.exports = router;
