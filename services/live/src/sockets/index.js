/**
 * Exprsn Live - Socket.IO Event Handlers
 * Handles real-time communication for streams and rooms
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const config = require('../config');
const logger = require('../utils/logger');
const streamService = require('../services/stream');
const roomService = require('../services/room');
const { Participant } = require('../models');

// Live stream chat is ephemeral (Twitch-style): messages live only in memory,
// mirroring the in-memory viewer/participant tracking. These bound the blast
// radius of an open chat firehose on a single-gateway MVP.
const CHAT_MAX_MESSAGE_LENGTH = 500;   // chars; longer messages are truncated
const CHAT_HISTORY_LIMIT = 50;         // messages retained per stream for late joiners
const CHAT_RATE_WINDOW_MS = 10000;     // sliding window for the send rate limit
const CHAT_RATE_MAX = 8;               // max messages per window per socket

// The CA's /api/tokens/validate is guarded by requireSessionOrService, so a
// server-to-server call must present an identity-bound service token. Mirror the
// timeline/moderator socket validators (CA_URL is the env the shared validators read).
const CA_URL = process.env.CA_URL || process.env.CA_BASE_URL || config.ca.baseUrl;
function serviceHeaders() {
  const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME;
  if (!serviceId) return {};
  try {
    return { 'X-Service-ID': serviceId, 'X-Service-Token': deriveServiceToken(serviceId) };
  } catch (err) {
    logger.warn('Service identity not available for live socket auth', { error: err.message });
    return {};
  }
}

/**
 * Validate a CA bearer presented on the socket handshake.
 * Returns { userId, email } when valid, otherwise null.
 */
async function validateBearer(socket) {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const { data } = await axios.post(
      `${CA_URL}/api/tokens/validate`,
      { token, requiredPermissions: { read: true } },
      { timeout: 5000, headers: { 'Content-Type': 'application/json', ...serviceHeaders() } }
    );
    if (!data.valid || !data.userId) return null;
    return { userId: data.userId, email: data.tokenData && data.tokenData.email };
  } catch (err) {
    logger.warn('Live socket bearer validation failed', { error: err.message });
    return null;
  }
}

class SocketHandler {
  constructor(io) {
    this.io = io;

    // Track socket connections
    this.connections = new Map(); // socketId -> { userId, streamId?, roomId? }
    this.streamViewers = new Map(); // streamId -> Set of socketIds
    this.roomParticipants = new Map(); // roomId -> Map of socketId -> participantData
    this.streamChat = new Map(); // streamId -> array of recent chat messages (capped)

    this.setupAuth();
    this.setupHandlers();
  }

  /**
   * Optional-auth handshake middleware.
   *
   * `/live` is open to anonymous stream VIEWERS by design (HLS playback is over
   * HTTP and viewer tracking via `join-stream` carries no privilege), so we never
   * reject a connection here. We DO validate any presented CA bearer and stamp the
   * socket identity, which the publish/host event guards below require. Keeping the
   * viewer path auth-free preserves connect latency for the common case.
   */
  setupAuth() {
    this.io.use(async (socket, next) => {
      try {
        const identity = await validateBearer(socket);
        socket.authenticated = !!identity;
        socket.userId = identity ? identity.userId : null;
        socket.userEmail = identity ? identity.email : null;
      } catch (err) {
        // Never block a viewer on an auth hiccup — just treat as anonymous.
        socket.authenticated = false;
        socket.userId = null;
      }
      next();
    });
  }

  /**
   * Guard for broadcaster/host actions: requires a validated CA identity.
   * Emits an `unauthorized` error to the caller and returns false when missing.
   */
  requireAuthed(socket, event) {
    if (socket.authenticated && socket.userId) return true;
    logger.warn('Rejected unauthenticated live action', { socketId: socket.id, event });
    socket.emit('error', {
      event,
      code: 'UNAUTHENTICATED',
      message: 'Authentication required for this action'
    });
    return false;
  }

  /**
   * Setup Socket.IO event handlers
   */
  setupHandlers() {
    this.io.on('connection', (socket) => {
      logger.info('Client connected', {
        socketId: socket.id,
        authenticated: socket.authenticated,
        userId: socket.userId
      });

      // Initialize connection tracking (userId comes from the validated bearer,
      // never from client-supplied data).
      this.connections.set(socket.id, {
        userId: socket.userId || null,
        authenticated: !!socket.authenticated,
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

        // Replay recent chat so a late joiner has context immediately.
        const history = this.streamChat.get(streamId);
        if (history && history.length) {
          socket.emit('chat-history', { streamId, messages: history });
        }

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

    // Send a chat message to a stream. Reading chat is open to anonymous
    // viewers (they receive `chat-history` + broadcasts), but POSTING requires a
    // validated CA identity — the author is bound to that identity, never to
    // client-supplied data, so chat can't be spoofed.
    socket.on('stream-chat-message', ({ streamId, message, displayName } = {}) => {
      try {
        if (!this.requireAuthed(socket, 'stream-chat-message')) {
          return;
        }

        if (!streamId || typeof message !== 'string') {
          return;
        }

        // Only members of the stream's socket room may post to it (you must have
        // joined the stream you're chatting in).
        const viewers = this.streamViewers.get(streamId);
        if (!viewers || !viewers.has(socket.id)) {
          socket.emit('error', {
            event: 'stream-chat-message',
            code: 'NOT_IN_STREAM',
            message: 'Join the stream before chatting'
          });
          return;
        }

        const text = message.trim().slice(0, CHAT_MAX_MESSAGE_LENGTH);
        if (!text) {
          return;
        }

        if (this.isChatRateLimited(socket)) {
          socket.emit('error', {
            event: 'stream-chat-message',
            code: 'RATE_LIMITED',
            message: 'You are sending messages too quickly'
          });
          return;
        }

        const chatMessage = {
          id: uuidv4(),
          streamId,
          userId: socket.userId,
          // Display name is cosmetic (client-supplied); the userId above is the
          // authoritative, identity-bound author. Cap + fall back to identity.
          displayName: this.resolveChatDisplayName(socket, displayName),
          message: text,
          ts: Date.now()
        };

        this.appendChatHistory(streamId, chatMessage);

        // Broadcast to everyone in the stream room (including the sender, so the
        // client renders from a single authoritative source).
        this.io.to(streamId).emit('stream-chat-message', chatMessage);

      } catch (error) {
        logger.error('Error handling stream chat message:', error);
      }
    });
  }

  /**
   * Sliding-window send rate limit, per socket. Keeps an open chat from being
   * used to flood the room. Returns true when the caller should be throttled.
   */
  isChatRateLimited(socket) {
    const now = Date.now();
    const times = (socket._chatTimes || []).filter((t) => now - t < CHAT_RATE_WINDOW_MS);
    if (times.length >= CHAT_RATE_MAX) {
      socket._chatTimes = times;
      return true;
    }
    times.push(now);
    socket._chatTimes = times;
    return false;
  }

  /** Pick a safe, bounded display name for a chat author. */
  resolveChatDisplayName(socket, supplied) {
    const trimmed = typeof supplied === 'string' ? supplied.trim() : '';
    const raw =
      trimmed ||
      (socket.userId ? `user-${String(socket.userId).slice(0, 8)}` : 'Anonymous');
    return String(raw).slice(0, 80);
  }

  /** Append a message to a stream's capped in-memory history buffer. */
  appendChatHistory(streamId, message) {
    let history = this.streamChat.get(streamId);
    if (!history) {
      history = [];
      this.streamChat.set(streamId, history);
    }
    history.push(message);
    if (history.length > CHAT_HISTORY_LIMIT) {
      history.splice(0, history.length - CHAT_HISTORY_LIMIT);
    }
  }

  /**
   * Handle room-related events
   */
  handleRoomEvents(socket) {
    // Join a video chat room
    socket.on('join-room', async ({ roomId }) => {
      try {
        // Joining a room is a participant (publish/host) action — gated on a
        // validated identity. Anonymous viewers must not enter the WebRTC mesh.
        if (!this.requireAuthed(socket, 'join-room')) {
          return;
        }

        logger.info('Joining room', { socketId: socket.id, roomId, userId: socket.userId });

        // Track participant
        if (!this.roomParticipants.has(roomId)) {
          this.roomParticipants.set(roomId, new Map());
        }

        // Get participant from database (created via the authed POST /join API).
        // Bind by the validated user id so a socket cannot claim another user's
        // pre-registered participant slot; adopt this live socket id.
        const participant = await Participant.findOne({
          where: {
            user_id: socket.userId,
            room_id: roomId,
            status: 'connected'
          }
        });

        if (participant) {
          // Bind the authoritative socket id and join the room only after the
          // participant record is confirmed for this identity.
          if (participant.socket_id !== socket.id) {
            await participant.update({ socket_id: socket.id });
          }
          socket.join(roomId);

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
        if (!this.requireAuthed(socket, 'update-participant-state')) {
          return;
        }

        const participants = this.roomParticipants.get(roomId);
        if (!participants) {
          return;
        }

        // Only the socket that owns this participant slot may change its state.
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
    // All WebRTC signaling carries publish/peer media negotiation, so every
    // event requires a validated identity. Pure stream viewers use HLS over HTTP
    // and never emit these — gating them does not affect viewer latency.

    // Generic signal (for compatibility)
    socket.on('signal', ({ to, signal }) => {
      if (!this.requireAuthed(socket, 'signal')) {
        return;
      }
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
      if (!this.requireAuthed(socket, 'offer')) {
        return;
      }
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
      if (!this.requireAuthed(socket, 'answer')) {
        return;
      }
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
      if (!this.requireAuthed(socket, 'ice-candidate')) {
        return;
      }
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
      // platform: this.io is the /live namespace; sockets map lives at nsp.sockets
      const socket = this.io.sockets.get(socketId);
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
      // platform: this.io is the /live namespace; sockets map lives at nsp.sockets
      const socket = this.io.sockets.get(socketId);
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

    // Cleanup viewers + ephemeral chat
    this.streamViewers.delete(streamId);
    this.streamChat.delete(streamId);

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
