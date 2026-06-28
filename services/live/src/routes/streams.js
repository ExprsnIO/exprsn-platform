/**
 * Stream Routes
 * API endpoints for live streaming
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const streamService = require('../services/stream');
const { resolveMembership, ROLE_RANK } = require('@exprsn/shared/middleware/groupMembership');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../middleware/validation');
const logger = require('../utils/logger');

/**
 * Authorize a manage action (update/delete/start/stop) on a stream.
 *
 * Personal streams: only the host (user_id) may manage them.
 * Group streams (group_id set): "go live for the group" is an owner/admin
 * action, so any owner/admin of the owning group may manage them — delegated to
 * the nexus group model via the shared membership resolver. The original host
 * still passes because creation required group admin.
 *
 * @param {Object} req - Express request (req.user.id required)
 * @param {Object} stream - formatted stream (has user_id, group_id)
 * @returns {Promise<{ok: boolean, status?: number, error?: string, message?: string}>}
 */
async function authorizeStreamManage(req, stream) {
  if (!stream.group_id) {
    if (stream.user_id !== req.user.id) {
      return { ok: false, status: 403, error: 'FORBIDDEN', message: 'You do not own this stream' };
    }
    return { ok: true };
  }

  const membership = await resolveMembership(stream.group_id, req.user.id);

  if (membership._error === 'not_found') {
    return { ok: false, status: 404, error: 'GROUP_NOT_FOUND', message: 'Group not found' };
  }
  if (membership._error === 'unavailable') {
    return {
      ok: false,
      status: 503,
      error: 'MEMBERSHIP_SERVICE_UNAVAILABLE',
      message: 'Unable to verify group membership'
    };
  }

  const have = ROLE_RANK[membership.role] || 0;
  if (!membership.isMember || have < ROLE_RANK.admin) {
    return {
      ok: false,
      status: 403,
      error: 'ADMIN_REQUIRED',
      message: 'This action requires group admin privileges'
    };
  }

  return { ok: true };
}

/**
 * POST /api/streams - Create a new live stream
 */
router.post('/',
  requireAuth,
  validateBody(schemas.createStream),
  async (req, res) => {
    try {
      const stream = await streamService.createStream(req.body, req.user.id);

      logger.info('Stream created via API', {
        streamId: stream.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        stream
      });
    } catch (error) {
      logger.error('Failed to create stream:', error);
      res.status(500).json({
        error: 'CREATE_FAILED',
        message: error.message || 'Failed to create stream'
      });
    }
  }
);

/**
 * GET /api/streams - List active streams
 */
router.get('/',
  optionalAuth,
  validateQuery(schemas.listStreams),
  async (req, res) => {
    try {
      const result = await streamService.listStreams(req.query);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Failed to list streams:', error);
      res.status(500).json({
        error: 'LIST_FAILED',
        message: 'Failed to list streams'
      });
    }
  }
);

/**
 * GET /api/streams/:id - Get stream details
 */
router.get('/:id',
  optionalAuth,
  validateParams(Joi.object({ id: schemas.uuid })),
  async (req, res) => {
    try {
      const stream = await streamService.getStream(req.params.id);

      if (!stream) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Stream not found'
        });
      }

      // Check visibility
      if (stream.visibility === 'private' && (!req.user || req.user.id !== stream.user_id)) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'This stream is private'
        });
      }

      res.json({
        success: true,
        stream
      });
    } catch (error) {
      logger.error('Failed to get stream:', error);
      res.status(500).json({
        error: 'GET_FAILED',
        message: 'Failed to get stream'
      });
    }
  }
);

/**
 * PUT /api/streams/:id - Update stream
 */
router.put('/:id',
  requireAuth,
  validateParams(Joi.object({ id: schemas.uuid })),
  validateBody(schemas.updateStream),
  async (req, res) => {
    try {
      const stream = await streamService.getStream(req.params.id);

      if (!stream) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Stream not found'
        });
      }

      // Personal-owner check, or group-admin check for group streams.
      const auth = await authorizeStreamManage(req, stream);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error, message: auth.message });
      }

      const updatedStream = await streamService.updateStream(req.params.id, req.body);

      res.json({
        success: true,
        stream: updatedStream
      });
    } catch (error) {
      logger.error('Failed to update stream:', error);
      res.status(500).json({
        error: 'UPDATE_FAILED',
        message: error.message || 'Failed to update stream'
      });
    }
  }
);

/**
 * DELETE /api/streams/:id - End/delete stream
 */
router.delete('/:id',
  requireAuth,
  validateParams(Joi.object({ id: schemas.uuid })),
  async (req, res) => {
    try {
      const stream = await streamService.getStream(req.params.id);

      if (!stream) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Stream not found'
        });
      }

      // Personal-owner check, or group-admin check for group streams.
      const auth = await authorizeStreamManage(req, stream);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error, message: auth.message });
      }

      await streamService.deleteStream(req.params.id);

      // Notify viewers via Socket.IO
      if (req.socketHandler) {
        req.socketHandler.broadcastStreamDeleted(req.params.id);
      }

      res.json({
        success: true,
        message: 'Stream deleted'
      });
    } catch (error) {
      logger.error('Failed to delete stream:', error);
      res.status(500).json({
        error: 'DELETE_FAILED',
        message: error.message || 'Failed to delete stream'
      });
    }
  }
);

/**
 * POST /api/streams/:id/start - Start streaming
 */
router.post('/:id/start',
  requireAuth,
  validateParams(Joi.object({ id: schemas.uuid })),
  async (req, res) => {
    try {
      const stream = await streamService.getStream(req.params.id);

      if (!stream) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Stream not found'
        });
      }

      // Personal-owner check, or group-admin check for group streams.
      const auth = await authorizeStreamManage(req, stream);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error, message: auth.message });
      }

      const updatedStream = await streamService.startStream(req.params.id);

      // Notify viewers via Socket.IO
      if (req.socketHandler) {
        req.socketHandler.broadcastStreamStarted(req.params.id);
      }

      res.json({
        success: true,
        stream: updatedStream
      });
    } catch (error) {
      logger.error('Failed to start stream:', error);
      res.status(500).json({
        error: 'START_FAILED',
        message: error.message || 'Failed to start stream'
      });
    }
  }
);

/**
 * POST /api/streams/:id/stop - Stop streaming
 */
router.post('/:id/stop',
  requireAuth,
  validateParams(Joi.object({ id: schemas.uuid })),
  async (req, res) => {
    try {
      const stream = await streamService.getStream(req.params.id);

      if (!stream) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Stream not found'
        });
      }

      // Personal-owner check, or group-admin check for group streams.
      const auth = await authorizeStreamManage(req, stream);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error, message: auth.message });
      }

      const updatedStream = await streamService.endStream(req.params.id);

      // Notify viewers via Socket.IO
      if (req.socketHandler) {
        req.socketHandler.broadcastStreamEnded(req.params.id);
      }

      res.json({
        success: true,
        stream: updatedStream
      });
    } catch (error) {
      logger.error('Failed to stop stream:', error);
      res.status(500).json({
        error: 'STOP_FAILED',
        message: error.message || 'Failed to stop stream'
      });
    }
  }
);

/**
 * POST /api/streams/:id/share-events - Track share funnel events
 */
router.post('/:id/share-events',
  optionalAuth,
  validateParams(Joi.object({ id: schemas.uuid })),
  validateBody(schemas.trackShareEvent),
  async (req, res) => {
    try {
      const stream = await streamService.getStream(req.params.id);

      if (!stream) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Stream not found'
        });
      }

      // Check visibility for private streams
      if (stream.visibility === 'private' && (!req.user || req.user.id !== stream.user_id)) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'This stream is private'
        });
      }

      const metrics = await streamService.trackShareEvent(
        req.params.id,
        req.body.eventType,
        {
          source: req.body.source,
          ref: req.body.ref
        }
      );

      res.json({
        success: true,
        metrics
      });
    } catch (error) {
      logger.error('Failed to track stream share event:', error);
      res.status(500).json({
        error: 'TRACK_SHARE_FAILED',
        message: error.message || 'Failed to track share event'
      });
    }
  }
);

/**
 * GET /api/streams/:id/recordings - Get stream recordings
 */
router.get('/:id/recordings',
  optionalAuth,
  validateParams(Joi.object({ id: schemas.uuid })),
  async (req, res) => {
    try {
      const stream = await streamService.getStream(req.params.id);

      if (!stream) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Stream not found'
        });
      }

      // Check visibility for private streams
      if (stream.visibility === 'private' && (!req.user || req.user.id !== stream.user_id)) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'This stream is private'
        });
      }

      const recordings = await streamService.getStreamRecordings(req.params.id);

      res.json({
        success: true,
        recordings
      });
    } catch (error) {
      logger.error('Failed to get recordings:', error);
      res.status(500).json({
        error: 'GET_RECORDINGS_FAILED',
        message: 'Failed to get recordings'
      });
    }
  }
);

module.exports = router;
