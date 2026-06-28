/**
 * ═══════════════════════════════════════════════════════════
 * Socket.IO Handler
 * Real-time timeline updates with CA token authentication
 * ═══════════════════════════════════════════════════════════
 */

const { logger } = require('@exprsn/shared');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const axios = require('axios');
const config = require('../config');

/**
 * Identity-bound service headers for CA calls. The CA's /api/tokens/validate
 * is guarded by requireSessionOrService, so the socket handshake must present
 * X-Service-ID/X-Service-Token (there is no browser session on the WS upgrade).
 * Returns {} when no service identity is configured so the CA still decides.
 */
function buildServiceHeaders() {
  const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME;
  if (!serviceId) return {};
  try {
    return {
      'X-Service-ID': serviceId,
      'X-Service-Token': deriveServiceToken(serviceId)
    };
  } catch (error) {
    logger.warn('Service identity not available for CA socket auth', { error: error.message });
    return {};
  }
}

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
      { timeout: 5000, headers: buildServiceHeaders() }
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
     * Subscribe to a group's feed. Membership authorization here is best-effort
     * (deferred): the REST layer (requireGroupMembership) is the enforcement
     * boundary — non-members simply receive no events because group posts are
     * only created/served via guarded REST routes.
     */
    socket.on('subscribe:group', (payload) => {
      const groupId = typeof payload === 'string' ? payload : payload && payload.groupId;
      if (!groupId) {
        return socket.emit('error', { message: 'groupId required' });
      }

      socket.join(`timeline:group:${groupId}`);

      logger.info('User subscribed to group timeline', {
        userId: socket.userId,
        groupId
      });

      socket.emit('subscribed:group', { groupId });
    });

    /**
     * Unsubscribe from a group's feed.
     */
    socket.on('unsubscribe:group', (payload) => {
      const groupId = typeof payload === 'string' ? payload : payload && payload.groupId;
      if (!groupId) {
        return socket.emit('error', { message: 'groupId required' });
      }

      socket.leave(`timeline:group:${groupId}`);

      logger.info('User unsubscribed from group timeline', {
        userId: socket.userId,
        groupId
      });

      socket.emit('unsubscribed:group', { groupId });
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
 * Resolve the target room for a broadcast. Group posts are scoped to their
 * group room so private/unlisted group content never leaks to the global feed;
 * non-group posts keep the existing global behavior.
 */
function targetRoom(groupId) {
  return groupId ? `timeline:group:${groupId}` : 'timeline:global';
}

/**
 * Broadcast new post to timeline (or its group room when post.groupId is set).
 */
function broadcastNewPost(io, post) {
  const groupId = post && post.groupId;
  io.to(targetRoom(groupId)).emit('new:post', post);
  logger.info('Broadcasted new post', { postId: post.id, groupId: groupId || null });
}

/**
 * Broadcast post like to timeline (or its group room).
 */
function broadcastPostLike(io, postId, userId, groupId = null) {
  io.to(targetRoom(groupId)).emit('post:liked', { postId, userId, groupId: groupId || null });
  logger.info('Broadcasted post like', { postId, userId, groupId: groupId || null });
}

/**
 * Broadcast post comment to timeline (or its group room).
 */
function broadcastPostComment(io, postId, comment, groupId = null) {
  io.to(targetRoom(groupId)).emit('post:commented', { postId, comment, groupId: groupId || null });
  logger.info('Broadcasted post comment', { postId, groupId: groupId || null });
}

module.exports.broadcastNewPost = broadcastNewPost;
module.exports.broadcastPostLike = broadcastPostLike;
module.exports.broadcastPostComment = broadcastPostComment;
