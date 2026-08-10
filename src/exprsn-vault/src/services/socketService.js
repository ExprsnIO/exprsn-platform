/**
 * Socket.IO Service for Real-time Vault Updates
 * Provides live notifications for token events, policy changes, and security alerts
 */

const { Server } = require('socket.io');
const { validateCAToken } = require('@exprsn/shared');
const logger = require('../utils/logger');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedClients = new Map();
  }

  /**
   * Initialize Socket.IO server
   * @param {Object} httpServer - HTTP server instance
   */
  initialize(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true
      },
      path: '/socket.io'
    });

    this.setupMiddleware();
    this.setupEventHandlers();

    logger.info('Socket.IO service initialized');
  }

  /**
   * Setup authentication middleware
   */
  setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Validate CA token (optional for development, required for production)
        if (process.env.NODE_ENV === 'production') {
          const validation = await validateCAToken(token, {
            requiredPermissions: { read: true },
            resource: '/admin/*'
          });

          if (!validation.valid) {
            return next(new Error('Invalid authentication token'));
          }

          socket.user = {
            id: validation.userId,
            permissions: validation.permissions
          };
        } else {
          // Development mode - allow connection
          socket.user = {
            id: 'dev_user',
            permissions: { read: true, write: true, delete: true }
          };
        }

        next();
      } catch (error) {
        logger.error('Socket authentication failed', { error: error.message });
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const clientId = socket.id;
      this.connectedClients.set(clientId, {
        socket,
        user: socket.user,
        connectedAt: new Date()
      });

      logger.info('Client connected', {
        clientId,
        userId: socket.user?.id,
        totalClients: this.connectedClients.size
      });

      // Join admin room
      socket.join('admin');

      // Send welcome message
      socket.emit('connected', {
        clientId,
        timestamp: new Date().toISOString(),
        message: 'Connected to Vault real-time updates'
      });

      // Handle subscription to specific channels
      socket.on('subscribe', (channels) => {
        if (Array.isArray(channels)) {
          channels.forEach(channel => {
            socket.join(channel);
            logger.debug('Client subscribed to channel', { clientId, channel });
          });
        }
      });

      // Handle unsubscription
      socket.on('unsubscribe', (channels) => {
        if (Array.isArray(channels)) {
          channels.forEach(channel => {
            socket.leave(channel);
            logger.debug('Client unsubscribed from channel', { clientId, channel });
          });
        }
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        this.connectedClients.delete(clientId);
        logger.info('Client disconnected', {
          clientId,
          reason,
          totalClients: this.connectedClients.size
        });
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error('Socket error', { clientId, error: error.message });
      });
    });
  }

  /**
   * Emit token events
   */
  emitTokenEvent(event, data) {
    if (!this.io) return;

    this.io.to('admin').emit('token:event', {
      event,
      data,
      timestamp: new Date().toISOString()
    });

    logger.debug('Token event emitted', { event, tokenId: data.tokenId });
  }

  /**
   * Emit token created event
   */
  emitTokenCreated(token) {
    this.emitTokenEvent('created', {
      tokenId: token.tokenId,
      displayName: token.displayName,
      entityType: token.entityType,
      entityId: token.entityId,
      riskScore: token.riskScore
    });
  }

  /**
   * Emit token revoked event
   */
  emitTokenRevoked(token, reason, revokedBy) {
    this.emitTokenEvent('revoked', {
      tokenId: token.tokenId,
      displayName: token.displayName,
      reason,
      revokedBy
    });
  }

  /**
   * Emit token suspended event
   */
  emitTokenSuspended(token, reason) {
    this.emitTokenEvent('suspended', {
      tokenId: token.tokenId,
      displayName: token.displayName,
      reason
    });
  }

  /**
   * Emit policy events
   */
  emitPolicyEvent(event, data) {
    if (!this.io) return;

    this.io.to('admin').emit('policy:event', {
      event,
      data,
      timestamp: new Date().toISOString()
    });

    logger.debug('Policy event emitted', { event, policyId: data.policyId || data.id });
  }

  /**
   * Emit anomaly alert
   */
  emitAnomalyAlert(tokenId, anomalies) {
    if (!this.io) return;

    const criticalAnomalies = anomalies.filter(a => a.severity === 'critical' || a.severity === 'high');

    if (criticalAnomalies.length > 0) {
      this.io.to('admin').emit('security:alert', {
        type: 'anomaly_detected',
        tokenId,
        anomalies: criticalAnomalies,
        timestamp: new Date().toISOString(),
        severity: 'high'
      });

      logger.warn('Critical anomaly alert sent', { tokenId, count: criticalAnomalies.length });
    }
  }

  /**
   * Emit statistics update
   */
  emitStatsUpdate(stats) {
    if (!this.io) return;

    this.io.to('admin').emit('stats:update', {
      stats,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit cache statistics update
   */
  emitCacheStats(stats) {
    if (!this.io) return;

    this.io.to('admin').emit('cache:stats', {
      stats,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit audit log entry
   */
  emitAuditLog(logEntry) {
    if (!this.io) return;

    this.io.to('admin').emit('audit:log', {
      log: logEntry,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast system notification
   */
  broadcastNotification(notification) {
    if (!this.io) return;

    this.io.to('admin').emit('notification', {
      ...notification,
      timestamp: new Date().toISOString()
    });

    logger.info('System notification broadcasted', {
      type: notification.type,
      recipients: this.connectedClients.size
    });
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return {
      connected: this.connectedClients.size,
      clients: Array.from(this.connectedClients.values()).map(client => ({
        clientId: client.socket.id,
        userId: client.user?.id,
        connectedAt: client.connectedAt,
        rooms: Array.from(client.socket.rooms)
      }))
    };
  }

  /**
   * Disconnect all clients
   */
  disconnectAll(reason = 'Server shutdown') {
    if (!this.io) return;

    this.io.emit('server:shutdown', {
      reason,
      timestamp: new Date().toISOString()
    });

    this.io.disconnectSockets(true);
    logger.info('All Socket.IO clients disconnected', { reason });
  }
}

// Singleton instance
const socketService = new SocketService();

module.exports = socketService;
