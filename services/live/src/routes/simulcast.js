/**
 * Simulcast Routes
 * API endpoints for multi-platform streaming
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const orchestrator = require('../services/orchestrator');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateParams } = require('../middleware/validation');
const logger = require('../utils/logger');
const { Stream, StreamDestination } = require('../models');

/**
 * POST /api/simulcast/:streamId/start - Start multi-platform streaming
 */
router.post('/:streamId/start',
  requireAuth,
  validateParams(Joi.object({
    streamId: Joi.string().uuid().required()
  })),
  validateBody(Joi.object({
    inputSource: Joi.string().uri().optional()
  })),
  async (req, res) => {
    try {
      const { streamId } = req.params;

      // Verify stream ownership
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Stream not found'
        });
      }

      if (stream.user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'You do not own this stream'
        });
      }

      // Start simulcast
      const result = await orchestrator.setupAndStartStream(streamId, req.body);

      logger.info('Simulcast started via API', {
        streamId,
        userId: req.user.id,
        destinationCount: result.destinations.length
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Failed to start simulcast:', error);
      res.status(500).json({
        success: false,
        error: 'START_FAILED',
        message: error.message || 'Failed to start simulcast'
      });
    }
  }
);

/**
 * POST /api/simulcast/:streamId/stop - Stop multi-platform streaming
 */
router.post('/:streamId/stop',
  requireAuth,
  validateParams(Joi.object({
    streamId: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      const { streamId } = req.params;

      // Verify stream ownership
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Stream not found'
        });
      }

      if (stream.user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'You do not own this stream'
        });
      }

      // Stop simulcast
      await orchestrator.stopStream(streamId);

      logger.info('Simulcast stopped via API', {
        streamId,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Simulcast stopped'
      });
    } catch (error) {
      logger.error('Failed to stop simulcast:', error);
      res.status(500).json({
        success: false,
        error: 'STOP_FAILED',
        message: error.message || 'Failed to stop simulcast'
      });
    }
  }
);

/**
 * GET /api/simulcast/:streamId/status - Get simulcast status
 */
router.get('/:streamId/status',
  requireAuth,
  validateParams(Joi.object({
    streamId: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      const { streamId } = req.params;

      // Verify stream ownership
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Stream not found'
        });
      }

      if (stream.user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'You do not own this stream'
        });
      }

      // Get comprehensive status
      const status = await orchestrator.getStreamStatus(streamId);

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error('Failed to get simulcast status:', error);
      res.status(500).json({
        success: false,
        error: 'STATUS_FAILED',
        message: error.message || 'Failed to get simulcast status'
      });
    }
  }
);

/**
 * GET /api/simulcast/:streamId/health - Get stream health
 */
router.get('/:streamId/health',
  requireAuth,
  validateParams(Joi.object({
    streamId: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      const { streamId } = req.params;

      // Verify stream ownership
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Stream not found'
        });
      }

      if (stream.user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'You do not own this stream'
        });
      }

      // Get health status
      const simulcastService = require('../services/simulcast');
      const health = simulcastService.getHealth(streamId);

      if (!health) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'No active simulcast found'
        });
      }

      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      logger.error('Failed to get stream health:', error);
      res.status(500).json({
        success: false,
        error: 'HEALTH_FAILED',
        message: error.message || 'Failed to get stream health'
      });
    }
  }
);

/**
 * GET /api/simulcast/:streamId/metrics - Get stream metrics
 */
router.get('/:streamId/metrics',
  requireAuth,
  validateParams(Joi.object({
    streamId: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      const { streamId } = req.params;

      // Verify stream ownership
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Stream not found'
        });
      }

      if (stream.user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'You do not own this stream'
        });
      }

      // Get metrics
      const simulcastService = require('../services/simulcast');
      const metrics = simulcastService.getMetrics(streamId);

      if (!metrics) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'No active simulcast found'
        });
      }

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      logger.error('Failed to get stream metrics:', error);
      res.status(500).json({
        success: false,
        error: 'METRICS_FAILED',
        message: error.message || 'Failed to get stream metrics'
      });
    }
  }
);

/**
 * POST /api/simulcast/:streamId/destinations - Add destination to active stream
 */
router.post('/:streamId/destinations',
  requireAuth,
  validateParams(Joi.object({
    streamId: Joi.string().uuid().required()
  })),
  validateBody(Joi.object({
    destinationId: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      const { streamId } = req.params;
      const { destinationId } = req.body;

      // Verify stream ownership
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Stream not found'
        });
      }

      if (stream.user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'You do not own this stream'
        });
      }

      // Get destination
      const destination = await StreamDestination.findByPk(destinationId);
      if (!destination || destination.stream_id !== streamId) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Destination not found'
        });
      }

      // Prepare and add destination
      const prepared = await orchestrator._prepareDestination(stream, destination);
      const simulcastService = require('../services/simulcast');
      const result = await simulcastService.addDestination(streamId, prepared);

      // Update destination status
      await destination.update({
        status: 'connecting',
        started_at: new Date()
      });

      logger.info('Destination added to active simulcast', {
        streamId,
        destinationId,
        platform: destination.platform
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Failed to add destination:', error);
      res.status(500).json({
        success: false,
        error: 'ADD_FAILED',
        message: error.message || 'Failed to add destination'
      });
    }
  }
);

/**
 * DELETE /api/simulcast/:streamId/destinations/:destinationId - Remove destination
 */
router.delete('/:streamId/destinations/:destinationId',
  requireAuth,
  validateParams(Joi.object({
    streamId: Joi.string().uuid().required(),
    destinationId: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      const { streamId, destinationId } = req.params;

      // Verify stream ownership
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Stream not found'
        });
      }

      if (stream.user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'You do not own this stream'
        });
      }

      // Stop destination
      const simulcastService = require('../services/simulcast');
      await simulcastService.stopDestination(streamId, destinationId);

      // Update destination status
      await StreamDestination.update(
        {
          status: 'disconnected',
          ended_at: new Date()
        },
        {
          where: { id: destinationId }
        }
      );

      logger.info('Destination removed from simulcast', {
        streamId,
        destinationId
      });

      res.json({
        success: true,
        message: 'Destination removed'
      });
    } catch (error) {
      logger.error('Failed to remove destination:', error);
      res.status(500).json({
        success: false,
        error: 'REMOVE_FAILED',
        message: error.message || 'Failed to remove destination'
      });
    }
  }
);

module.exports = router;
