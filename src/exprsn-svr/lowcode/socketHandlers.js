/**
 * Socket.IO Handlers for Low-Code Platform
 * Handles real-time updates for application statistics and collaboration
 */

const logger = require('./utils/logger');

// Track active connections per application
const appConnections = new Map();

// Track user sessions
const userSessions = new Map();

/**
 * Initialize Socket.IO handlers for low-code platform
 * @param {SocketIO.Server} io - Socket.IO server instance
 */
function initializeLowCodeSockets(io) {
  const lowcodeNamespace = io.of('/lowcode');

  lowcodeNamespace.on('connection', (socket) => {
    logger.info('[Socket.IO] Client connected to /lowcode', {
      socketId: socket.id,
      userId: socket.handshake.query.userId || 'anonymous'
    });

    // Handle joining an application room
    socket.on('join-app', async (appId) => {
      try {
        logger.info('[Socket.IO] User joining application', {
          socketId: socket.id,
          appId
        });

        // Join the application room
        socket.join(`app:${appId}`);

        // Track connection
        if (!appConnections.has(appId)) {
          appConnections.set(appId, new Set());
        }
        appConnections.get(appId).add(socket.id);

        // Get application stats
        const stats = await getApplicationStats(appId);

        // Send stats to all users in the room
        lowcodeNamespace.to(`app:${appId}`).emit('app-stats', stats);

        // Acknowledge join
        socket.emit('joined-app', { appId, stats });

      } catch (error) {
        logger.error('[Socket.IO] Error joining application', {
          error: error.message,
          appId
        });
        socket.emit('error', { message: 'Failed to join application' });
      }
    });

    // Handle leaving an application room
    socket.on('leave-app', (appId) => {
      try {
        logger.info('[Socket.IO] User leaving application', {
          socketId: socket.id,
          appId
        });

        socket.leave(`app:${appId}`);

        // Remove from connections tracking
        if (appConnections.has(appId)) {
          appConnections.get(appId).delete(socket.id);

          // Clean up empty sets
          if (appConnections.get(appId).size === 0) {
            appConnections.delete(appId);
          }
        }

        // Update stats for remaining users
        getApplicationStats(appId).then(stats => {
          lowcodeNamespace.to(`app:${appId}`).emit('app-stats', stats);
        });

      } catch (error) {
        logger.error('[Socket.IO] Error leaving application', {
          error: error.message,
          appId
        });
      }
    });

    // Handle entity updates (for real-time collaboration)
    socket.on('entity-update', (data) => {
      try {
        const { appId, entityId, action, payload } = data;

        logger.debug('[Socket.IO] Entity update', {
          appId,
          entityId,
          action
        });

        // Broadcast to all users in the app except sender
        socket.to(`app:${appId}`).emit('entity-updated', {
          entityId,
          action,
          payload,
          userId: socket.handshake.query.userId
        });

      } catch (error) {
        logger.error('[Socket.IO] Error handling entity update', {
          error: error.message
        });
      }
    });

    // Handle form collaboration events
    socket.on('form-editing', (data) => {
      try {
        const { appId, formId, userId, fieldId } = data;

        // Notify other users that someone is editing this field
        socket.to(`app:${appId}`).emit('form-field-locked', {
          formId,
          fieldId,
          userId
        });

      } catch (error) {
        logger.error('[Socket.IO] Error handling form editing', {
          error: error.message
        });
      }
    });

    // Handle process execution events
    socket.on('process-started', (data) => {
      try {
        const { appId, processId, instanceId } = data;

        logger.info('[Socket.IO] Process started', {
          appId,
          processId,
          instanceId
        });

        // Broadcast to app room
        lowcodeNamespace.to(`app:${appId}`).emit('process-update', {
          processId,
          instanceId,
          status: 'started',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('[Socket.IO] Error handling process start', {
          error: error.message
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info('[Socket.IO] Client disconnected from /lowcode', {
        socketId: socket.id
      });

      // Clean up all connections for this socket
      for (const [appId, connections] of appConnections.entries()) {
        if (connections.has(socket.id)) {
          connections.delete(socket.id);

          // Clean up empty sets
          if (connections.size === 0) {
            appConnections.delete(appId);
          } else {
            // Update stats for remaining users
            getApplicationStats(appId).then(stats => {
              lowcodeNamespace.to(`app:${appId}`).emit('app-stats', stats);
            });
          }
        }
      }
    });
  });

  // Periodically update stats for all active applications
  setInterval(() => {
    for (const appId of appConnections.keys()) {
      getApplicationStats(appId).then(stats => {
        lowcodeNamespace.to(`app:${appId}`).emit('app-stats', stats);
      }).catch(error => {
        logger.error('[Socket.IO] Error updating periodic stats', {
          error: error.message,
          appId
        });
      });
    }
  }, 30000); // Update every 30 seconds

  logger.info('[Socket.IO] Low-Code platform handlers initialized');
}

/**
 * Get application statistics
 * @param {string} appId - Application ID
 * @returns {Promise<Object>} Application statistics
 */
async function getApplicationStats(appId) {
  try {
    // Get active connections count
    const activeConnections = appConnections.has(appId)
      ? appConnections.get(appId).size
      : 0;

    // TODO: Get actual user/group/role counts from database
    // For now, returning mock data
    const stats = {
      activeConnections,
      totalUsers: 0,
      totalGroups: 0,
      totalRoles: 0,
      lastUpdated: new Date().toISOString()
    };

    // Try to fetch real counts if services are available
    try {
      // This would integrate with exprsn-auth service
      // const authStats = await getAuthStats(appId);
      // stats.totalUsers = authStats.users;
      // stats.totalGroups = authStats.groups;
      // stats.totalRoles = authStats.roles;
    } catch (error) {
      logger.debug('[Socket.IO] Could not fetch auth stats', {
        error: error.message
      });
    }

    return stats;

  } catch (error) {
    logger.error('[Socket.IO] Error getting app stats', {
      error: error.message,
      appId
    });

    return {
      activeConnections: 0,
      totalUsers: 0,
      totalGroups: 0,
      totalRoles: 0,
      lastUpdated: new Date().toISOString()
    };
  }
}

/**
 * Broadcast entity change to all users in an application
 * @param {SocketIO.Server} io - Socket.IO server
 * @param {string} appId - Application ID
 * @param {Object} changeData - Change data to broadcast
 */
function broadcastEntityChange(io, appId, changeData) {
  const lowcodeNamespace = io.of('/lowcode');
  lowcodeNamespace.to(`app:${appId}`).emit('entity-updated', changeData);
}

/**
 * Broadcast process update to all users in an application
 * @param {SocketIO.Server} io - Socket.IO server
 * @param {string} appId - Application ID
 * @param {Object} updateData - Update data to broadcast
 */
function broadcastProcessUpdate(io, appId, updateData) {
  const lowcodeNamespace = io.of('/lowcode');
  lowcodeNamespace.to(`app:${appId}`).emit('process-update', updateData);
}

/**
 * Get active connections count for an application
 * @param {string} appId - Application ID
 * @returns {number} Number of active connections
 */
function getActiveConnectionsCount(appId) {
  return appConnections.has(appId) ? appConnections.get(appId).size : 0;
}

module.exports = {
  initializeLowCodeSockets,
  broadcastEntityChange,
  broadcastProcessUpdate,
  getActiveConnectionsCount
};
