/**
 * ═══════════════════════════════════════════════════════════
 * Socket.IO Handler
 * Real-time timeline updates with CA token authentication
 * ═══════════════════════════════════════════════════════════
 */

const { logger } = require('@exprsn/shared');
const axios = require('axios');
const config = require('../config');

// Active connections map (userId -> socket)
const activeConnections = new Map();

/**
 * Validate CA token via Socket.IO handshake
 */
async function validateSocketToken(socket) {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.substring(7);

    if (!token) {
      logger.warn('Socket connection attempted without token');
      return null;
    }

    // Validate with CA
    const response = await axios.post(
      `${config.ca.url}/api/tokens/validate`,
      {
        token,
        requiredPermissions: { read: true }
      },
      { timeout: 5000 }
    );

    if (!response.data.valid) {
      logger.warn('Invalid socket token', { reason: response.data.reason });
      return null;
    }

    return {
      userId: response.data.userId,
      permissions: response.data.permissions,
      tokenData: response.data.tokenData
    };
  } catch (error) {
    logger.error('Socket token validation error', { error: error.message });
    return null;
  }
}

/**
 * Main Socket.IO handler
 */
module.exports = function(io) {
  /**
   * Middleware: Authenticate socket connections
   */
  io.use(async (socket, next) => {
    const auth = await validateSocketToken(socket);

    if (!auth) {
      return next(new Error('Authentication failed'));
    }

    socket.userId = auth.userId;
    socket.permissions = auth.permissions;
    socket.tokenData = auth.tokenData;

    next();
  });

  /**
   * Connection handler
   */
  io.on('connection', (socket) => {
    logger.info('Socket connected', {
      socketId: socket.id,
      userId: socket.userId
    });

    // Track active connection
    activeConnections.set(socket.userId, socket);

    // Join user's personal room for receiving updates
    socket.join(`user:${socket.userId}`);

    logger.info('User joined personal timeline room', {
      userId: socket.userId
    });

    /**
     * Subscribe to timeline updates
     */
    socket.on('subscribe:timeline', () => {
      socket.join('timeline:global');

      logger.info('User subscribed to global timeline', {
        userId: socket.userId
      });

      socket.emit('subscribed:timeline');
    });

    /**
     * Unsubscribe from timeline updates
     */
    socket.on('unsubscribe:timeline', () => {
      socket.leave('timeline:global');

      logger.info('User unsubscribed from global timeline', {
        userId: socket.userId
      });

      socket.emit('unsubscribed:timeline');
    });

    /**
     * Disconnect handler
     */
    socket.on('disconnect', () => {
      logger.info('Socket disconnected', {
        socketId: socket.id,
        userId: socket.userId
      });

      // Remove from active connections
      activeConnections.delete(socket.userId);
    });
  });

  logger.info('Socket.IO handlers initialized for Timeline');
};

/**
 * Broadcast new post to timeline
 */
function broadcastNewPost(io, post) {
  io.to('timeline:global').emit('new:post', post);
  logger.info('Broadcasted new post', { postId: post.id });
}

/**
 * Broadcast post like to timeline
 */
function broadcastPostLike(io, postId, userId) {
  io.to('timeline:global').emit('post:liked', { postId, userId });
  logger.info('Broadcasted post like', { postId, userId });
}

/**
 * Broadcast post comment to timeline
 */
function broadcastPostComment(io, postId, comment) {
  io.to('timeline:global').emit('post:commented', { postId, comment });
  logger.info('Broadcasted post comment', { postId });
}

module.exports.broadcastNewPost = broadcastNewPost;
module.exports.broadcastPostLike = broadcastPostLike;
module.exports.broadcastPostComment = broadcastPostComment;
