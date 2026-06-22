/**
 * Room Routes
 * API endpoints for video chat rooms
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const roomService = require('../services/room');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../middleware/validation');
const logger = require('../utils/logger');

/**
 * POST /api/rooms - Create a video chat room
 */
router.post('/',
  requireAuth,
  validateBody(schemas.createRoom),
  async (req, res) => {
    try {
      const room = await roomService.createRoom(req.body, req.user.id);

      logger.info('Room created via API', {
        roomId: room.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        room
      });
    } catch (error) {
      logger.error('Failed to create room:', error);
      res.status(500).json({
        error: 'CREATE_FAILED',
        message: error.message || 'Failed to create room'
      });
    }
  }
);

/**
 * GET /api/rooms - List available rooms
 */
router.get('/',
  optionalAuth,
  validateQuery(schemas.listRooms),
  async (req, res) => {
    try {
      const result = await roomService.listRooms(req.query);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Failed to list rooms:', error);
      res.status(500).json({
        error: 'LIST_FAILED',
        message: 'Failed to list rooms'
      });
    }
  }
);

/**
 * GET /api/rooms/code/:code - Get room by code
 */
router.get('/code/:code',
  optionalAuth,
  async (req, res) => {
    try {
      const room = await roomService.getRoomByCode(req.params.code);

      if (!room) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Room not found'
        });
      }

      res.json({
        success: true,
        room
      });
    } catch (error) {
      logger.error('Failed to get room by code:', error);
      res.status(500).json({
        error: 'GET_FAILED',
        message: 'Failed to get room'
      });
    }
  }
);

/**
 * GET /api/rooms/:id - Get room details
 */
router.get('/:id',
  optionalAuth,
  validateParams(Joi.object({ id: schemas.uuid })),
  async (req, res) => {
    try {
      const room = await roomService.getRoom(req.params.id);

      if (!room) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Room not found'
        });
      }

      res.json({
        success: true,
        room
      });
    } catch (error) {
      logger.error('Failed to get room:', error);
      res.status(500).json({
        error: 'GET_FAILED',
        message: 'Failed to get room'
      });
    }
  }
);

/**
 * PUT /api/rooms/:id - Update room
 */
router.put('/:id',
  requireAuth,
  validateParams(Joi.object({ id: schemas.uuid })),
  validateBody(schemas.updateRoom),
  async (req, res) => {
    try {
      const room = await roomService.getRoom(req.params.id);

      if (!room) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Room not found'
        });
      }

      // Check ownership
      if (room.host_id !== req.user.id) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You do not own this room'
        });
      }

      const updatedRoom = await roomService.updateRoom(req.params.id, req.body);

      res.json({
        success: true,
        room: updatedRoom
      });
    } catch (error) {
      logger.error('Failed to update room:', error);
      res.status(500).json({
        error: 'UPDATE_FAILED',
        message: error.message || 'Failed to update room'
      });
    }
  }
);

/**
 * POST /api/rooms/:id/join - Join a room
 */
router.post('/:id/join',
  requireAuth,
  validateParams(Joi.object({ id: schemas.uuid })),
  validateBody(schemas.joinRoom),
  async (req, res) => {
    try {
      const room = await roomService.getRoom(req.params.id);

      if (!room) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Room not found'
        });
      }

      // Check if room is full
      if (room.current_participant_count >= room.max_participants) {
        return res.status(403).json({
          error: 'ROOM_FULL',
          message: 'Room has reached maximum capacity'
        });
      }

      // Check password for private rooms
      if (room.is_private) {
        const passwordValid = await roomService.verifyPassword(req.params.id, req.body.password);
        if (!passwordValid) {
          return res.status(403).json({
            error: 'INVALID_PASSWORD',
            message: 'Incorrect room password'
          });
        }
      }

      // Get socket ID from query or header
      const socketId = req.query.socketId || req.headers['x-socket-id'] || 'web-' + Date.now();

      // Add participant
      const participant = await roomService.addParticipant(
        req.params.id,
        req.user.id,
        socketId,
        {
          displayName: req.body.displayName,
          peerId: req.body.peerId
        }
      );

      // Notify other participants via Socket.IO
      if (req.io) {
        req.io.to(req.params.id).emit('participant-joined', {
          roomId: req.params.id,
          participant: {
            id: participant.id,
            userId: participant.user_id,
            displayName: participant.display_name,
            role: participant.role
          }
        });
      }

      res.json({
        success: true,
        message: 'Joined room successfully',
        participant,
        room
      });
    } catch (error) {
      logger.error('Failed to join room:', error);
      res.status(500).json({
        error: 'JOIN_FAILED',
        message: error.message || 'Failed to join room'
      });
    }
  }
);

/**
 * POST /api/rooms/:id/leave - Leave a room
 */
router.post('/:id/leave',
  requireAuth,
  validateParams(Joi.object({ id: schemas.uuid })),
  async (req, res) => {
    try {
      const socketId = req.query.socketId || req.headers['x-socket-id'];

      if (!socketId) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Socket ID required'
        });
      }

      await roomService.removeParticipant(req.params.id, socketId);

      // Notify other participants via Socket.IO
      if (req.io) {
        req.io.to(req.params.id).emit('participant-left', {
          roomId: req.params.id,
          userId: req.user.id
        });
      }

      res.json({
        success: true,
        message: 'Left room successfully'
      });
    } catch (error) {
      logger.error('Failed to leave room:', error);
      res.status(500).json({
        error: 'LEAVE_FAILED',
        message: error.message || 'Failed to leave room'
      });
    }
  }
);

/**
 * GET /api/rooms/:id/participants - Get room participants
 */
router.get('/:id/participants',
  optionalAuth,
  validateParams(Joi.object({ id: schemas.uuid })),
  async (req, res) => {
    try {
      const participants = await roomService.getRoomParticipants(req.params.id);

      res.json({
        success: true,
        participants
      });
    } catch (error) {
      logger.error('Failed to get participants:', error);
      res.status(500).json({
        error: 'GET_PARTICIPANTS_FAILED',
        message: 'Failed to get participants'
      });
    }
  }
);

/**
 * GET /api/rooms/:id/recordings - Get room recordings
 */
router.get('/:id/recordings',
  optionalAuth,
  validateParams(Joi.object({ id: schemas.uuid })),
  async (req, res) => {
    try {
      const recordings = await roomService.getRoomRecordings(req.params.id);

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

/**
 * DELETE /api/rooms/:id - Close/delete room
 */
router.delete('/:id',
  requireAuth,
  validateParams(Joi.object({ id: schemas.uuid })),
  async (req, res) => {
    try {
      const room = await roomService.getRoom(req.params.id);

      if (!room) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Room not found'
        });
      }

      // Check ownership
      if (room.host_id !== req.user.id) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You do not own this room'
        });
      }

      // End room first
      await roomService.endRoom(req.params.id);

      // Notify participants via Socket.IO
      if (req.socketHandler) {
        req.socketHandler.broadcastRoomClosed(req.params.id);
      }

      // Delete room
      await roomService.deleteRoom(req.params.id);

      res.json({
        success: true,
        message: 'Room closed and deleted'
      });
    } catch (error) {
      logger.error('Failed to delete room:', error);
      res.status(500).json({
        error: 'DELETE_FAILED',
        message: error.message || 'Failed to delete room'
      });
    }
  }
);

module.exports = router;
