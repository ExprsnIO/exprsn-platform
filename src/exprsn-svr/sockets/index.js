/**
 * ═══════════════════════════════════════════════════════════
 * Socket.IO Event Handlers
 * Real-time communication for dynamic pages
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');
const { validateCAToken } = require('../middleware/caAuth');
const { initializeCollaboration } = require('../lowcode/sockets/collaboration');
const { initializeLowCodeSockets } = require('../lowcode/socketHandlers');
const collaborationService = require('../services/collaborationService');
const SetupConfigService = require('../lowcode/services/SetupConfigService');

/**
 * Initialize Socket.IO handlers
 */
function initializeSocketHandlers(io) {
  // Initialize Low-Code Platform collaboration namespace
  initializeCollaboration(io);

  // Initialize Low-Code Platform application statistics
  initializeLowCodeSockets(io);

  // Initialize Setup Configuration real-time monitoring
  initializeSetupMonitoring(io);
  // Connection event
  io.on('connection', (socket) => {
    logger.info('Socket.IO client connected', {
      socketId: socket.id,
      ip: socket.handshake.address
    });

    // Handle authentication
    socket.on('authenticate', async (data) => {
      try {
        const { token } = data;
        if (!token) {
          socket.emit('auth:error', { message: 'No token provided' });
          return;
        }

        // Validate CA token
        const parsedToken = typeof token === 'string' ? JSON.parse(token) : token;
        validateCAToken(parsedToken);

        // Store user info in socket
        socket.userId = parsedToken.userId;
        socket.caToken = parsedToken;

        socket.emit('auth:success', {
          userId: parsedToken.userId,
          message: 'Authenticated successfully'
        });

        logger.info('Socket authenticated', {
          socketId: socket.id,
          userId: parsedToken.userId
        });
      } catch (error) {
        logger.error('Socket authentication failed', {
          socketId: socket.id,
          error: error.message
        });
        socket.emit('auth:error', { message: error.message });
      }
    });

    // Join a page room
    socket.on('page:join', (data) => {
      const { pageId } = data;
      if (!pageId) {
        socket.emit('page:error', { message: 'Page ID required' });
        return;
      }

      socket.join('page:' + pageId);
      socket.currentPage = pageId;

      socket.emit('page:joined', { pageId });
      logger.info('Socket joined page', {
        socketId: socket.id,
        pageId,
        userId: socket.userId
      });
    });

    // Leave a page room
    socket.on('page:leave', (data) => {
      const { pageId } = data;
      if (!pageId) return;

      socket.leave('page:' + pageId);
      if (socket.currentPage === pageId) {
        socket.currentPage = null;
      }

      socket.emit('page:left', { pageId });
    });

    // Broadcast message to page room
    socket.on('page:message', (data) => {
      const { pageId, message, messageData } = data;
      if (!pageId || !message) {
        socket.emit('page:error', { message: 'Page ID and message required' });
        return;
      }

      // Broadcast to all clients in the page room except sender
      socket.to('page:' + pageId).emit('page:message', {
        from: socket.userId || 'anonymous',
        message,
        data: messageData,
        timestamp: Date.now()
      });
    });

    // Custom event forwarding
    socket.on('custom:event', (data) => {
      const { pageId, eventName, eventData } = data;
      if (!pageId || !eventName) {
        socket.emit('custom:error', { message: 'Page ID and event name required' });
        return;
      }

      // Emit custom event to page room
      io.to('page:' + pageId).emit(eventName, {
        from: socket.userId || 'anonymous',
        data: eventData,
        timestamp: Date.now()
      });
    });

    // Handle data updates
    socket.on('data:update', (data) => {
      const { pageId, key, value } = data;
      if (!pageId || !key) {
        socket.emit('data:error', { message: 'Page ID and key required' });
        return;
      }

      // Broadcast data update to page room
      io.to('page:' + pageId).emit('data:updated', {
        key,
        value,
        from: socket.userId || 'anonymous',
        timestamp: Date.now()
      });
    });

    // Collaboration handlers
    socket.on('collaboration:join', ({ sessionId, userId, userInfo }) => {
      try {
        const result = collaborationService.joinSession(sessionId, userId, userInfo);
        socket.join(`collab:${sessionId}`);
        socket.collaborationSession = sessionId;

        // Send session state to joining user
        socket.emit('collaboration:joined', result);

        // Broadcast to other users in session
        socket.to(`collab:${sessionId}`).emit('user:joined', {
          userId,
          userInfo
        });
      } catch (error) {
        logger.error('Collaboration join error', { error: error.message });
        socket.emit('collaboration:error', { message: error.message });
      }
    });

    socket.on('collaboration:leave', ({ sessionId, userId }) => {
      try {
        collaborationService.leaveSession(sessionId, userId);
        socket.leave(`collab:${sessionId}`);
        socket.collaborationSession = null;

        // Broadcast to other users
        socket.to(`collab:${sessionId}`).emit('user:left', { userId });
      } catch (error) {
        logger.error('Collaboration leave error', { error: error.message });
      }
    });

    socket.on('collaboration:cursor', ({ sessionId, userId, position }) => {
      try {
        collaborationService.updateCursor(sessionId, userId, position);
        socket.to(`collab:${sessionId}`).emit('cursor:update', { userId, position });
      } catch (error) {
        logger.error('Cursor update error', { error: error.message });
      }
    });

    socket.on('collaboration:change', ({ sessionId, userId, operation }) => {
      try {
        const change = collaborationService.applyChange(sessionId, userId, operation);
        socket.to(`collab:${sessionId}`).emit('change:received', change);
      } catch (error) {
        logger.error('Change apply error', { error: error.message });
        socket.emit('collaboration:error', { message: error.message });
      }
    });

    socket.on('collaboration:lock', ({ sessionId, userId, lockKey }) => {
      try {
        const lock = collaborationService.acquireLock(sessionId, userId, lockKey);
        socket.emit('lock:acquired', { lockKey, lock });
        socket.to(`collab:${sessionId}`).emit('lock:acquired', { userId, lockKey });
      } catch (error) {
        logger.error('Lock acquire error', { error: error.message });
        socket.emit('collaboration:error', { message: error.message });
      }
    });

    socket.on('collaboration:unlock', ({ sessionId, userId, lockKey }) => {
      try {
        collaborationService.releaseLock(sessionId, userId, lockKey);
        socket.emit('lock:released', { lockKey });
        socket.to(`collab:${sessionId}`).emit('lock:released', { userId, lockKey });
      } catch (error) {
        logger.error('Lock release error', { error: error.message });
      }
    });

    // Autosave handlers for Form Designer Pro
    socket.on('autosave:save', async (formData, callback) => {
      try {
        const redis = require('../config/redis');
        const { formId, formName, schema, components, customFunctions, variables, timestamp, version } = formData;

        if (!formId) {
          return callback({ success: false, error: 'Form ID is required' });
        }

        // Store in Redis with 24-hour expiration
        const redisKey = `autosave:form:${formId}`;
        const autosaveData = {
          formId,
          formName,
          schema,
          components,
          customFunctions,
          variables,
          timestamp,
          version,
          savedAt: Date.now(),
          userId: socket.userId || 'anonymous'
        };

        await redis.setex(redisKey, 86400, JSON.stringify(autosaveData)); // 24 hours

        logger.info('Form autosaved to Redis', {
          formId,
          formName,
          userId: socket.userId,
          size: JSON.stringify(autosaveData).length
        });

        callback({
          success: true,
          timestamp: autosaveData.savedAt,
          message: 'Form autosaved successfully'
        });

        // Emit confirmation event
        socket.emit('autosave:saved', {
          formId,
          timestamp: autosaveData.savedAt
        });
      } catch (error) {
        logger.error('Autosave to Redis failed', {
          formId: formData.formId,
          error: error.message
        });

        callback({
          success: false,
          error: error.message || 'Failed to save to Redis'
        });

        socket.emit('autosave:error', {
          formId: formData.formId,
          error: error.message
        });
      }
    });

    socket.on('autosave:load', async (data, callback) => {
      try {
        const redis = require('../config/redis');
        const { formId } = data;

        if (!formId) {
          return callback({ success: false, error: 'Form ID is required' });
        }

        const redisKey = `autosave:form:${formId}`;
        const autosaveDataString = await redis.get(redisKey);

        if (!autosaveDataString) {
          return callback({
            success: true,
            data: null,
            message: 'No autosave data found'
          });
        }

        const autosaveData = JSON.parse(autosaveDataString);

        logger.info('Form autosave loaded from Redis', {
          formId,
          savedAt: autosaveData.savedAt,
          userId: socket.userId
        });

        callback({
          success: true,
          data: autosaveData,
          message: 'Autosave data loaded successfully'
        });
      } catch (error) {
        logger.error('Autosave load from Redis failed', {
          formId: data.formId,
          error: error.message
        });

        callback({
          success: false,
          error: error.message || 'Failed to load from Redis'
        });
      }
    });

    socket.on('autosave:clear', async (data, callback) => {
      try {
        const redis = require('../config/redis');
        const { formId } = data;

        if (!formId) {
          return callback({ success: false, error: 'Form ID is required' });
        }

        const redisKey = `autosave:form:${formId}`;
        await redis.del(redisKey);

        logger.info('Form autosave cleared from Redis', {
          formId,
          userId: socket.userId
        });

        callback({
          success: true,
          message: 'Autosave data cleared successfully'
        });
      } catch (error) {
        logger.error('Autosave clear from Redis failed', {
          formId: data.formId,
          error: error.message
        });

        callback({
          success: false,
          error: error.message || 'Failed to clear from Redis'
        });
      }
    });

    // Application management events
    socket.on('application:join', (data) => {
      const { userId } = data;
      if (!userId) {
        socket.emit('application:error', { message: 'User ID required' });
        return;
      }

      socket.join('applications:' + userId);
      socket.applicationUserId = userId;

      socket.emit('application:joined', { userId });
      logger.info('Socket joined applications room', {
        socketId: socket.id,
        userId
      });
    });

    socket.on('application:leave', (data) => {
      const { userId } = data;
      if (!userId) return;

      socket.leave('applications:' + userId);
      if (socket.applicationUserId === userId) {
        socket.applicationUserId = null;
      }

      socket.emit('application:left', { userId });
    });

    // Broadcast application deletion to other clients
    socket.on('application:deleted', (data) => {
      const { applicationId, userId } = data;
      if (!applicationId || !userId) {
        socket.emit('application:error', { message: 'Application ID and User ID required' });
        return;
      }

      // Broadcast to all clients in the user's applications room except sender
      socket.to('applications:' + userId).emit('application:deleted', applicationId);

      logger.info('Application deletion broadcasted', {
        socketId: socket.id,
        userId,
        applicationId
      });
    });

    // Ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Disconnect event
    socket.on('disconnect', (reason) => {
      // Auto-leave collaboration session on disconnect
      if (socket.collaborationSession && socket.userId) {
        collaborationService.leaveSession(socket.collaborationSession, socket.userId);
        socket.to(`collab:${socket.collaborationSession}`).emit('user:left', { userId: socket.userId });
      }

      logger.info('Socket.IO client disconnected', {
        socketId: socket.id,
        userId: socket.userId,
        reason
      });
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error('Socket.IO error', {
        socketId: socket.id,
        userId: socket.userId,
        error: error.message
      });
    });
  });

  logger.info('Socket.IO handlers initialized');
}

/**
 * Initialize Setup Configuration real-time monitoring
 */
function initializeSetupMonitoring(io) {
  io.on('connection', (socket) => {
    // Join setup room for real-time configuration updates
    socket.on('join-setup-room', () => {
      socket.join('setup-room');
      logger.info('Socket joined setup room', { socketId: socket.id });

      // Start periodic system health broadcasts (every 5 seconds)
      const healthInterval = setInterval(async () => {
        try {
          const health = await SetupConfigService.getSystemHealth();
          io.to('setup-room').emit('system-health-update', health);
        } catch (error) {
          logger.error('Failed to broadcast system health', { error: error.message });
        }
      }, 5000);

      // Clean up on disconnect
      socket.on('disconnect', () => {
        clearInterval(healthInterval);
        logger.info('Socket left setup room', { socketId: socket.id });
      });
    });

    // Manual service health check request
    socket.on('check-service', async (data, callback) => {
      try {
        const { serviceId } = data;
        const services = await SetupConfigService.checkAllServices();
        const service = services.find(s => s.id === serviceId);

        if (!service) {
          return callback({ success: false, message: 'Service not found' });
        }

        const health = await SetupConfigService.checkService(service.port);
        callback({ success: true, serviceId, health });

        // Broadcast status update to all in room
        io.to('setup-room').emit('service-status-update', {
          serviceId,
          status: health.running ? 'running' : 'stopped',
          responseTime: health.responseTime,
          uptime: health.uptime
        });
      } catch (error) {
        logger.error('Service health check failed', { error: error.message });
        callback({ success: false, error: error.message });
      }
    });

    // Database connection check
    socket.on('check-database', async (data, callback) => {
      try {
        const { databaseId } = data;
        const databases = await SetupConfigService.getAllDatabases();
        const database = databases.find(db => db.id === databaseId);

        if (!database) {
          return callback({ success: false, message: 'Database not found' });
        }

        const status = await SetupConfigService.checkDatabaseConnection(database.name);
        callback({ success: true, databaseId, status });

        // Broadcast status update
        io.to('setup-room').emit('database-status-update', {
          databaseId,
          connected: status.connected,
          tableCount: status.tableCount,
          size: status.size
        });
      } catch (error) {
        logger.error('Database check failed', { error: error.message });
        callback({ success: false, error: error.message });
      }
    });
  });

  logger.info('Setup Configuration real-time monitoring initialized');
}

module.exports = initializeSocketHandlers;
