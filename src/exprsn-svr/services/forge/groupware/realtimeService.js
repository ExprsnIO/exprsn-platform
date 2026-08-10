const logger = require('../../../utils/logger');
const documentService = require('./documentService');
const commentService = require('./commentService');

/**
 * Real-time Collaboration Service
 *
 * Socket.IO event handlers for real-time groupware features
 */

/**
 * Initialize Socket.IO collaboration handlers
 */
function initializeCollaboration(io) {
  io.on('connection', (socket) => {
    logger.info('Client connected for collaboration', {
      socketId: socket.id,
      userId: socket.userId
    });

    // Document collaboration events
    socket.on('document:join', handleDocumentJoin(socket));
    socket.on('document:leave', handleDocumentLeave(socket));
    socket.on('document:cursor', handleDocumentCursor(socket));
    socket.on('document:typing', handleDocumentTyping(socket));
    socket.on('document:edit', handleDocumentEdit(socket));

    // General entity room management
    socket.on('entity:join', handleEntityJoin(socket));
    socket.on('entity:leave', handleEntityLeave(socket));

    // Presence tracking
    socket.on('presence:update', handlePresenceUpdate(socket));

    // Disconnect
    socket.on('disconnect', () => handleDisconnect(socket, io));
  });

  logger.info('Socket.IO collaboration handlers initialized');
}

/**
 * Handle document join (for collaborative editing)
 */
function handleDocumentJoin(socket) {
  return async (data) => {
    try {
      const { documentId } = data;

      if (!documentId || !socket.userId) {
        socket.emit('error', { message: 'Document ID and user ID required' });
        return;
      }

      // Join document room
      socket.join(`document:${documentId}`);

      // Register as active editor
      const activeEditors = await documentService.registerEditor(
        documentId,
        socket.userId,
        socket.userName || 'Unknown User'
      );

      // Notify other editors
      socket.to(`document:${documentId}`).emit('document:editor:joined', {
        userId: socket.userId,
        userName: socket.userName,
        documentId
      });

      // Send current editor list to joining user
      socket.emit('document:editors', {
        documentId,
        editors: activeEditors
      });

      logger.info('User joined document for collaboration', {
        documentId,
        userId: socket.userId,
        activeEditors: activeEditors.length
      });
    } catch (error) {
      logger.error('Failed to join document', {
        error: error.message
      });
      socket.emit('error', { message: 'Failed to join document' });
    }
  };
}

/**
 * Handle document leave
 */
function handleDocumentLeave(socket) {
  return async (data) => {
    try {
      const { documentId } = data;

      if (!documentId || !socket.userId) {
        return;
      }

      // Leave document room
      socket.leave(`document:${documentId}`);

      // Unregister editor
      const activeEditors = await documentService.unregisterEditor(
        documentId,
        socket.userId
      );

      // Notify other editors
      socket.to(`document:${documentId}`).emit('document:editor:left', {
        userId: socket.userId,
        documentId,
        remainingEditors: activeEditors.length
      });

      logger.info('User left document', {
        documentId,
        userId: socket.userId
      });
    } catch (error) {
      logger.error('Failed to leave document', {
        error: error.message
      });
    }
  };
}

/**
 * Handle cursor position updates
 */
function handleDocumentCursor(socket) {
  return async (data) => {
    try {
      const { documentId, position } = data;

      if (!documentId || !socket.userId) {
        return;
      }

      // Update cursor position
      await documentService.updateEditorCursor(
        documentId,
        socket.userId,
        position
      );

      // Broadcast to other editors
      socket.to(`document:${documentId}`).emit('document:cursor:update', {
        userId: socket.userId,
        userName: socket.userName,
        position,
        documentId
      });
    } catch (error) {
      logger.error('Failed to update cursor', {
        error: error.message
      });
    }
  };
}

/**
 * Handle typing indicator
 */
function handleDocumentTyping(socket) {
  return (data) => {
    const { documentId, isTyping } = data;

    if (!documentId || !socket.userId) {
      return;
    }

    // Broadcast typing status to other editors
    socket.to(`document:${documentId}`).emit('document:typing', {
      userId: socket.userId,
      userName: socket.userName,
      isTyping,
      documentId
    });
  };
}

/**
 * Handle document edit (for operational transformation)
 */
function handleDocumentEdit(socket) {
  return (data) => {
    const { documentId, operation, position, content } = data;

    if (!documentId || !socket.userId) {
      return;
    }

    // Broadcast edit operation to other editors
    socket.to(`document:${documentId}`).emit('document:edit:remote', {
      userId: socket.userId,
      userName: socket.userName,
      operation, // 'insert', 'delete', 'replace'
      position,
      content,
      documentId,
      timestamp: Date.now()
    });

    logger.debug('Document edit broadcasted', {
      documentId,
      userId: socket.userId,
      operation
    });
  };
}

/**
 * Handle joining entity rooms (for comments, updates, etc.)
 */
function handleEntityJoin(socket) {
  return (data) => {
    const { entityType, entityId } = data;

    if (!entityType || !entityId) {
      socket.emit('error', { message: 'Entity type and ID required' });
      return;
    }

    const roomName = `${entityType}:${entityId}`;
    socket.join(roomName);

    logger.info('User joined entity room', {
      userId: socket.userId,
      roomName
    });

    socket.emit('entity:joined', { entityType, entityId });
  };
}

/**
 * Handle leaving entity rooms
 */
function handleEntityLeave(socket) {
  return (data) => {
    const { entityType, entityId } = data;

    if (!entityType || !entityId) {
      return;
    }

    const roomName = `${entityType}:${entityId}`;
    socket.leave(roomName);

    logger.info('User left entity room', {
      userId: socket.userId,
      roomName
    });
  };
}

/**
 * Handle presence updates
 */
function handlePresenceUpdate(socket) {
  return (data) => {
    const { status, activity } = data;

    if (!socket.userId) {
      return;
    }

    // Broadcast presence to user's room
    socket.to(`user:${socket.userId}`).emit('presence:update', {
      userId: socket.userId,
      status, // 'online', 'away', 'busy', 'offline'
      activity, // 'editing', 'viewing', 'idle'
      timestamp: Date.now()
    });

    logger.debug('Presence updated', {
      userId: socket.userId,
      status,
      activity
    });
  };
}

/**
 * Handle client disconnect
 */
function handleDisconnect(socket, io) {
  return async () => {
    if (!socket.userId) {
      return;
    }

    try {
      // Get all rooms the socket was in
      const rooms = Array.from(socket.rooms);

      // Unregister from all documents
      for (const room of rooms) {
        if (room.startsWith('document:')) {
          const documentId = room.split(':')[1];
          const activeEditors = await documentService.unregisterEditor(
            documentId,
            socket.userId
          );

          // Notify other editors
          io.to(room).emit('document:editor:left', {
            userId: socket.userId,
            documentId,
            remainingEditors: activeEditors.length
          });
        }
      }

      logger.info('Client disconnected from collaboration', {
        socketId: socket.id,
        userId: socket.userId
      });
    } catch (error) {
      logger.error('Error handling disconnect', {
        error: error.message
      });
    }
  };
}

/**
 * Broadcast event to entity room
 */
function broadcastToEntity(io, entityType, entityId, eventName, data) {
  const roomName = `${entityType}:${entityId}`;
  io.to(roomName).emit(eventName, data);

  logger.debug('Event broadcasted to entity room', {
    roomName,
    eventName
  });
}

/**
 * Broadcast event to user
 */
function broadcastToUser(io, userId, eventName, data) {
  io.to(`user:${userId}`).emit(eventName, data);

  logger.debug('Event broadcasted to user', {
    userId,
    eventName
  });
}

/**
 * Get active users in room
 */
async function getActiveUsersInRoom(io, roomName) {
  try {
    const sockets = await io.in(roomName).fetchSockets();
    const users = sockets
      .filter(s => s.userId)
      .map(s => ({
        userId: s.userId,
        userName: s.userName,
        socketId: s.id
      }));

    return users;
  } catch (error) {
    logger.error('Failed to get active users in room', {
      roomName,
      error: error.message
    });
    return [];
  }
}

module.exports = {
  initializeCollaboration,
  broadcastToEntity,
  broadcastToUser,
  getActiveUsersInRoom
};
