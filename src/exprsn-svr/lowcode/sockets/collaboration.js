/**
 * Collaboration Socket.IO Handlers
 * Real-time collaboration for form editing
 */

const collaborationService = require('../services/CollaborationService');
const logger = require('../utils/logger');
const { authenticateSocket } = require('@exprsn/shared');

/**
 * Initialize collaboration socket namespace
 */
function initializeCollaboration(io) {
  const collaborationNamespace = io.of('/lowcode/collaboration');

  // Socket authentication middleware
  collaborationNamespace.use(async (socket, next) => {
    try {
      // Extract token from handshake
      const token = socket.handshake.auth.token ||
                   socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Validate CA token using shared middleware
      const mockReq = {
        headers: { authorization: `Bearer ${token}` }
      };

      const mockRes = {};

      await new Promise((resolve, reject) => {
        authenticateSocket(mockReq, socket, (err) => {
          if (err) {
            reject(err);
          } else {
            // Store user info on socket
            socket.userId = socket.user.id;
            socket.userName = socket.user.username || socket.user.email;
            resolve();
          }
        });
      });

      next();
    } catch (error) {
      logger.error('[Socket Collaboration] Auth error:', error);
      next(new Error('Authentication failed'));
    }
  });

  collaborationNamespace.on('connection', (socket) => {
    logger.info('[Socket Collaboration] User connected:', {
      userId: socket.userId,
      socketId: socket.id
    });

    /**
     * Join a form editing session
     */
    socket.on('join-form', (data) => {
      const { formId } = data;

      if (!formId) {
        return socket.emit('error', { message: 'Form ID required' });
      }

      // Join Socket.IO room
      socket.join(`form:${formId}`);

      // Register with collaboration service
      const result = collaborationService.joinFormSession(
        socket.userId,
        formId,
        socket.userName
      );

      if (result.success) {
        // Notify user
        socket.emit('joined-form', {
          formId,
          activeUsers: result.activeUsers
        });

        // Broadcast to other users
        socket.to(`form:${formId}`).emit('user-joined', {
          userId: socket.userId,
          userName: socket.userName,
          joinedAt: Date.now()
        });

        logger.info('[Socket Collaboration] User joined form:', {
          userId: socket.userId,
          formId,
          activeUsers: result.activeUsers.length
        });
      } else {
        socket.emit('error', { message: result.error });
      }
    });

    /**
     * Leave a form editing session
     */
    socket.on('leave-form', (data) => {
      const { formId } = data;

      if (!formId) {
        return socket.emit('error', { message: 'Form ID required' });
      }

      // Leave Socket.IO room
      socket.leave(`form:${formId}`);

      // Unregister from collaboration service
      const result = collaborationService.leaveFormSession(socket.userId);

      if (result.success) {
        // Broadcast to other users
        socket.to(`form:${formId}`).emit('user-left', {
          userId: socket.userId,
          activeUsers: result.activeUsers
        });

        logger.info('[Socket Collaboration] User left form:', {
          userId: socket.userId,
          formId
        });
      }
    });

    /**
     * Update cursor position
     */
    socket.on('cursor-move', (data) => {
      const { cursor } = data;

      const result = collaborationService.updateCursor(socket.userId, cursor);

      if (result.success) {
        // Broadcast cursor position to other users
        socket.to(`form:${result.formId}`).emit('cursor-updated', {
          userId: socket.userId,
          userName: socket.userName,
          cursor
        });
      }
    });

    /**
     * Update selection
     */
    socket.on('selection-change', (data) => {
      const { selection } = data;

      const result = collaborationService.updateSelection(socket.userId, selection);

      if (result.success) {
        // Broadcast selection to other users
        socket.to(`form:${result.formId}`).emit('selection-updated', {
          userId: socket.userId,
          userName: socket.userName,
          selection
        });
      }
    });

    /**
     * Acquire editing lock
     */
    socket.on('acquire-lock', (data) => {
      const { formId, duration } = data;

      const result = collaborationService.acquireLock(formId, socket.userId, duration);

      if (result.success) {
        socket.emit('lock-acquired', result.lock);

        // Notify other users
        socket.to(`form:${formId}`).emit('lock-status-changed', {
          locked: true,
          userId: socket.userId,
          userName: socket.userName
        });
      } else {
        socket.emit('lock-failed', {
          error: result.error,
          lockedBy: result.lockedBy
        });
      }
    });

    /**
     * Release editing lock
     */
    socket.on('release-lock', (data) => {
      const { formId } = data;

      const result = collaborationService.releaseLock(formId, socket.userId);

      if (result.success) {
        socket.emit('lock-released');

        // Notify other users
        socket.to(`form:${formId}`).emit('lock-status-changed', {
          locked: false
        });
      } else {
        socket.emit('error', { message: result.error });
      }
    });

    /**
     * Broadcast a change
     */
    socket.on('form-change', (data) => {
      const { formId, change } = data;

      // Record change
      const result = collaborationService.recordChange(formId, {
        ...change,
        userId: socket.userId,
        userName: socket.userName
      });

      if (result.success) {
        // Broadcast to other users
        socket.to(`form:${formId}`).emit('change-received', {
          changeId: result.changeId,
          userId: socket.userId,
          change
        });
      }
    });

    /**
     * Request recent changes
     */
    socket.on('get-changes', (data) => {
      const { formId, since } = data;

      const changes = collaborationService.getChangesSince(formId, since || 0);

      socket.emit('changes-list', { formId, changes });
    });

    /**
     * Get active users
     */
    socket.on('get-active-users', (data) => {
      const { formId } = data;

      const users = collaborationService.getActiveUsers(formId);

      socket.emit('active-users', { formId, users });
    });

    /**
     * Handle disconnection
     */
    socket.on('disconnect', (reason) => {
      const result = collaborationService.leaveFormSession(socket.userId);

      if (result.success && result.formId) {
        // Notify other users
        socket.to(`form:${result.formId}`).emit('user-left', {
          userId: socket.userId,
          activeUsers: result.activeUsers
        });
      }

      logger.info('[Socket Collaboration] User disconnected:', {
        userId: socket.userId,
        reason
      });
    });

    /**
     * Handle errors
     */
    socket.on('error', (error) => {
      logger.error('[Socket Collaboration] Socket error:', {
        userId: socket.userId,
        error: error.message
      });
    });
  });

  logger.info('[Socket Collaboration] Namespace initialized: /lowcode/collaboration');

  return collaborationNamespace;
}

module.exports = { initializeCollaboration };
