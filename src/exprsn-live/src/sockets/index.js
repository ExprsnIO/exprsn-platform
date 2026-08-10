/**
 * Exprsn Live - Socket.IO Event Handlers
 * Handles real-time communication for streams and rooms
 */

const logger = require('../utils/logger');
const streamService = require('../services/stream');
const roomService = require('../services/room');
const { Participant } = require('../models');

class SocketHandler {
  constructor(io) {
    this.io = io;

    // Track socket connections
    this.connections = new Map(); // socketId -> { userId, streamId?, roomId? }
    this.streamViewers = new Map(); // streamId -> Set of socketIds
    this.roomParticipants = new Map(); // roomId -> Map of socketId -> participantData

    this.setupHandlers();
  }

  /**
   * Setup Socket.IO event handlers
   */
  setupHandlers() {
    this.io.on('connection', (socket) => {
      logger.info('Client connected', { socketId: socket.id });

      // Initialize connection tracking
      this.connections.set(socket.id, {
        userId: null,
        streamId: null,
        roomId: null,
        connectedAt: Date.now()
      });

      // Stream events
      this.handleStreamEvents(socket);

      // Room events
      this.handleRoomEvents(socket);

      // WebRTC signaling events
      this.handleWebRTCSignaling(socket);

      // Disconnect handler
      this.handleDisconnect(socket);
    });
  }

  /**
   * Handle stream-related events
   */
  handleStreamEvents(socket) {
    // Join a stream (as viewer)
    socket.on('join-stream', async ({ streamId }) => {
      try {
        logger.info('Joining stream', { socketId: socket.id, streamId });

        // Join socket room
        socket.join(streamId);

        // Track viewer
        if (!this.streamViewers.has(streamId)) {
          this.streamViewers.set(streamId, new Set());
        }
        this.streamViewers.get(streamId).add(socket.id);

        // Update connection tracking
        const conn = this.connections.get(socket.id);
        if (conn) {
          conn.streamId = streamId;
        }

        // Get current viewer count
        const viewerCount = this.streamViewers.get(streamId).size;

        // Notify all viewers of updated count
        this.io.to(streamId).emit('viewer-count-updated', {
          streamId,
          count: viewerCount
        });

        // Notify others that a viewer joined
        socket.to(streamId).emit('viewer-joined', {
          streamId,
          socketId: socket.id,
          viewerCount
        });

        logger.info('Joined stream successfully', {
          socketId: socket.id,
          streamId,
          viewerCount
        });

      } catch (error) {
        logger.error('Error joining stream:', error);
        socket.emit('error', {
          event: 'join-stream',
          message: 'Failed to join stream'
        });
      }
    });

    // Leave a stream
    socket.on('leave-stream', async ({ streamId }) => {
      try {
        logger.info('Leaving stream', { socketId: socket.id, streamId });

        await this.removeStreamViewer(socket.id, streamId);

      } catch (error) {
        logger.error('Error leaving stream:', error);
      }
    });
  }

  /**
   * Handle room-related events
   */
  handleRoomEvents(socket) {
    // Join a video chat room
    socket.on('join-room', async ({ roomId }) => {
      try {
        logger.info('Joining room', { socketId: socket.id, roomId });

        // Join socket room
        socket.join(roomId);

        // Track participant
        if (!this.roomParticipants.has(roomId)) {
          this.roomParticipants.set(roomId, new Map());
        }

        // Get participant from database (should have been created via API call)
        const participant = await Participant.findOne({
          where: {
            socket_id: socket.id,
            room_id: roomId,
            status: 'connected'
          }
        });

        if (participant) {
          this.roomParticipants.get(roomId).set(socket.id, {
            userId: participant.user_id,
            participantId: participant.id,
            displayName: participant.display_name,
            role: participant.role,
            isAudioEnabled: true,
            isVideoEnabled: true,
            joinedAt: Date.now()
          });

          // Update connection tracking
          const conn = this.connections.get(socket.id);
          if (conn) {
            conn.roomId = roomId;
            conn.userId = participant.user_id;
          }

          // Notify all participants
          socket.to(roomId).emit('participant-joined', {
            roomId,
            participant: {
              id: participant.id,
              userId: participant.user_id,
              displayName: participant.display_name,
              role: participant.role,
              socketId: socket.id
            }
          });

          // Send list of existing participants to the new participant
          const existingParticipants = Array.from(
            this.roomParticipants.get(roomId).entries()
          )
            .filter(([sid]) => sid !== socket.id)
            .map(([sid, data]) => ({
              socketId: sid,
              userId: data.userId,
              displayName: data.displayName,
              role: data.role,
              isAudioEnabled: data.isAudioEnabled,
              isVideoEnabled: data.isVideoEnabled
            }));

          socket.emit('existing-participants', {
            roomId,
            participants: existingParticipants
          });

          logger.info('Joined room successfully', {
            socketId: socket.id,
            roomId,
            participantCount: this.roomParticipants.get(roomId).size
          });
        } else {
          logger.warn('No participant record found for socket', {
            socketId: socket.id,
            roomId
          });
        }

      } catch (error) {
        logger.error('Error joining room:', error);
        socket.emit('error', {
          event: 'join-room',
          message: 'Failed to join room'
        });
      }
    });

    // Leave a room
    socket.on('leave-room', async ({ roomId }) => {
      try {
        logger.info('Leaving room', { socketId: socket.id, roomId });

        await this.removeRoomParticipant(socket.id, roomId);

      } catch (error) {
        logger.error('Error leaving room:', error);
      }
    });

    // Update participant state (audio/video on/off)
    socket.on('update-participant-state', ({ roomId, state }) => {
      try {
        const participants = this.roomParticipants.get(roomId);
        if (!participants) {
          return;
        }

        const participant = participants.get(socket.id);
        if (!participant) {
          return;
        }

        // Update state
        if (typeof state.audioEnabled !== 'undefined') {
          participant.isAudioEnabled = state.audioEnabled;
        }
        if (typeof state.videoEnabled !== 'undefined') {
          participant.isVideoEnabled = state.videoEnabled;
        }

        // Notify others
        socket.to(roomId).emit('participant-state-changed', {
          roomId,
          socketId: socket.id,
          userId: participant.userId,
          state: {
            isAudioEnabled: participant.isAudioEnabled,
            isVideoEnabled: participant.isVideoEnabled
          }
        });

        logger.info('Participant state updated', {
          socketId: socket.id,
          roomId,
          state
        });

      } catch (error) {
        logger.error('Error updating participant state:', error);
      }
    });
  }

  /**
   * Handle WebRTC signaling events
   */
  handleWebRTCSignaling(socket) {
    // Generic signal (for compatibility)
    socket.on('signal', ({ to, signal }) => {
      logger.debug('Forwarding signal', {
        from: socket.id,
        to
      });

      // Forward to specific peer
      socket.to(to).emit('signal', {
        from: socket.id,
        signal
      });
    });

    // WebRTC offer
    socket.on('offer', ({ to, offer }) => {
      logger.debug('Forwarding offer', {
        from: socket.id,
        to
      });

      socket.to(to).emit('offer', {
        from: socket.id,
        offer
      });
    });

    // WebRTC answer
    socket.on('answer', ({ to, answer }) => {
      logger.debug('Forwarding answer', {
        from: socket.id,
        to
      });

      socket.to(to).emit('answer', {
        from: socket.id,
        answer
      });
    });

    // ICE candidate
    socket.on('ice-candidate', ({ to, candidate }) => {
      logger.debug('Forwarding ICE candidate', {
        from: socket.id,
        to
      });

      socket.to(to).emit('ice-candidate', {
        from: socket.id,
        candidate
      });
    });
  }

  /**
   * Handle disconnect
   */
  handleDisconnect(socket) {
    socket.on('disconnect', async (reason) => {
      logger.info('Client disconnected', {
        socketId: socket.id,
        reason
      });

      try {
        const conn = this.connections.get(socket.id);

        if (conn) {
          // Remove from stream if joined
          if (conn.streamId) {
            await this.removeStreamViewer(socket.id, conn.streamId);
          }

          // Remove from room if joined
          if (conn.roomId) {
            await this.removeRoomParticipant(socket.id, conn.roomId);
          }

          // Remove connection tracking
          this.connections.delete(socket.id);
        }

      } catch (error) {
        logger.error('Error during disconnect cleanup:', error);
      }
    });
  }

  /**
   * Remove viewer from stream
   */
  async removeStreamViewer(socketId, streamId) {
    try {
      const viewers = this.streamViewers.get(streamId);
      if (!viewers) {
        return;
      }

      // Remove from tracking
      viewers.delete(socketId);

      // Leave socket room
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(streamId);
      }

      // Get updated viewer count
      const viewerCount = viewers.size;

      // Cleanup if no viewers left
      if (viewerCount === 0) {
        this.streamViewers.delete(streamId);
      }

      // Notify remaining viewers
      this.io.to(streamId).emit('viewer-count-updated', {
        streamId,
        count: viewerCount
      });

      this.io.to(streamId).emit('viewer-left', {
        streamId,
        socketId,
        viewerCount
      });

      logger.info('Removed viewer from stream', {
        socketId,
        streamId,
        viewerCount
      });

    } catch (error) {
      logger.error('Error removing stream viewer:', error);
    }
  }

  /**
   * Remove participant from room
   */
  async removeRoomParticipant(socketId, roomId) {
    try {
      const participants = this.roomParticipants.get(roomId);
      if (!participants) {
        return;
      }

      const participant = participants.get(socketId);
      if (!participant) {
        return;
      }

      // Update participant status in database
      await Participant.update(
        {
          status: 'disconnected',
          left_at: new Date()
        },
        {
          where: {
            socket_id: socketId,
            room_id: roomId
          }
        }
      );

      // Remove from tracking
      participants.delete(socketId);

      // Leave socket room
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(roomId);
      }

      // Cleanup if no participants left
      if (participants.size === 0) {
        this.roomParticipants.delete(roomId);
      }

      // Notify remaining participants
      this.io.to(roomId).emit('participant-left', {
        roomId,
        socketId,
        userId: participant.userId,
        participantCount: participants.size
      });

      logger.info('Removed participant from room', {
        socketId,
        roomId,
        userId: participant.userId,
        participantCount: participants.size
      });

    } catch (error) {
      logger.error('Error removing room participant:', error);
    }
  }

  /**
   * Broadcast stream started event
   */
  broadcastStreamStarted(streamId) {
    this.io.emit('stream-started', { streamId });
    logger.info('Broadcast stream started', { streamId });
  }

  /**
   * Broadcast stream ended event
   */
  broadcastStreamEnded(streamId) {
    this.io.emit('stream-ended', { streamId });
    logger.info('Broadcast stream ended', { streamId });
  }

  /**
   * Broadcast stream deleted event
   */
  broadcastStreamDeleted(streamId) {
    this.io.emit('stream-deleted', { streamId });

    // Cleanup viewers
    this.streamViewers.delete(streamId);

    logger.info('Broadcast stream deleted', { streamId });
  }

  /**
   * Broadcast room closed event
   */
  broadcastRoomClosed(roomId) {
    this.io.to(roomId).emit('room-closed', { roomId });

    // Cleanup participants
    this.roomParticipants.delete(roomId);

    logger.info('Broadcast room closed', { roomId });
  }

  /**
   * Get connection stats
   */
  getStats() {
    return {
      connections: this.connections.size,
      streams: this.streamViewers.size,
      rooms: this.roomParticipants.size,
      totalViewers: Array.from(this.streamViewers.values())
        .reduce((sum, viewers) => sum + viewers.size, 0),
      totalParticipants: Array.from(this.roomParticipants.values())
        .reduce((sum, participants) => sum + participants.size, 0)
    };
  }

  /**
   * Get stream viewer count
   */
  getStreamViewerCount(streamId) {
    const viewers = this.streamViewers.get(streamId);
    return viewers ? viewers.size : 0;
  }

  /**
   * Get room participant count
   */
  getRoomParticipantCount(roomId) {
    const participants = this.roomParticipants.get(roomId);
    return participants ? participants.size : 0;
  }
}

module.exports = SocketHandler;
