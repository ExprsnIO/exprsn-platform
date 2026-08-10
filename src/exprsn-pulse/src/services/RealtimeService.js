/**
 * Realtime Service
 * Manages Socket.IO real-time dashboard updates
 */

const socketIo = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const { Dashboard } = require('../models');
const DashboardService = require('./DashboardService');
const logger = require('../utils/logger');
const { authenticateSocket } = require('@exprsn/shared');

class RealtimeService {
  constructor() {
    this.io = null;
    this.dashboardRooms = new Map();
  }

  /**
   * Initialize Socket.IO server
   */
  async initialize(httpServer) {
    this.io = socketIo(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true
      },
      path: '/pulse-realtime'
    });

    // Setup Redis adapter if Redis is enabled
    if (process.env.REDIS_ENABLED === 'true') {
      try {
        const pubClient = createClient({
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD || undefined
        });

        const subClient = pubClient.duplicate();

        await Promise.all([pubClient.connect(), subClient.connect()]);

        this.io.adapter(createAdapter(pubClient, subClient));

        logger.info('Socket.IO Redis adapter initialized', {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379
        });
      } catch (error) {
        logger.warn('Failed to initialize Socket.IO Redis adapter, using in-memory adapter', {
          error: error.message
        });
      }
    }

    this.setupMiddleware();
    this.setupEventHandlers();

    logger.info('Real-time service initialized');
  }

  /**
   * Setup Socket.IO middleware
   */
  setupMiddleware() {
    // Use shared Socket.IO authentication middleware
    // This validates CA tokens and sets socket.user with authenticated user data
    this.io.use(authenticateSocket);

    // Log successful connections
    this.io.use((socket, next) => {
      logger.info('Socket authenticated', {
        socketId: socket.id,
        userId: socket.user?.id || 'anonymous'
      });
      next();
    });
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info('Client connected', { socketId: socket.id, userId: socket.user?.id });

      // Join dashboard room
      socket.on('subscribe:dashboard', async (dashboardId) => {
        try {
          const dashboard = await Dashboard.findByPk(dashboardId);

          if (!dashboard) {
            socket.emit('error', { message: 'Dashboard not found' });
            return;
          }

          // Join room
          socket.join(`dashboard:${dashboardId}`);

          // Track subscription
          if (!this.dashboardRooms.has(dashboardId)) {
            this.dashboardRooms.set(dashboardId, new Set());
          }
          this.dashboardRooms.get(dashboardId).add(socket.id);

          logger.info('Client subscribed to dashboard', {
            socketId: socket.id,
            dashboardId
          });

          // Send initial dashboard data
          const rendered = await DashboardService.render(dashboardId, { skipViewTracking: true });
          socket.emit('dashboard:data', rendered);

          // Start auto-refresh if configured
          if (dashboard.isRealtime || dashboard.refreshInterval) {
            this._startDashboardRefresh(socket, dashboardId, dashboard.refreshInterval || 30);
          }
        } catch (error) {
          logger.error('Failed to subscribe to dashboard', {
            socketId: socket.id,
            dashboardId,
            error: error.message
          });
          socket.emit('error', { message: 'Failed to subscribe to dashboard' });
        }
      });

      // Unsubscribe from dashboard
      socket.on('unsubscribe:dashboard', (dashboardId) => {
        socket.leave(`dashboard:${dashboardId}`);

        const room = this.dashboardRooms.get(dashboardId);
        if (room) {
          room.delete(socket.id);
          if (room.size === 0) {
            this.dashboardRooms.delete(dashboardId);
          }
        }

        // Stop refresh intervals
        this._stopDashboardRefresh(socket, dashboardId);

        logger.info('Client unsubscribed from dashboard', {
          socketId: socket.id,
          dashboardId
        });
      });

      // Manual refresh request
      socket.on('dashboard:refresh', async (dashboardId) => {
        try {
          const rendered = await DashboardService.render(dashboardId, {
            skipViewTracking: true,
            autoRefresh: true
          });

          socket.emit('dashboard:data', rendered);
        } catch (error) {
          logger.error('Failed to refresh dashboard', {
            socketId: socket.id,
            dashboardId,
            error: error.message
          });
          socket.emit('error', { message: 'Failed to refresh dashboard' });
        }
      });

      // Ping/pong for connection monitoring
      socket.on('ping', () => {
        socket.emit('pong');
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        // Clean up subscriptions
        for (const [dashboardId, sockets] of this.dashboardRooms.entries()) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            this.dashboardRooms.delete(dashboardId);
          }
        }

        logger.info('Client disconnected', { socketId: socket.id });
      });
    });
  }

  /**
   * Start auto-refresh for dashboard
   */
  _startDashboardRefresh(socket, dashboardId, intervalSeconds) {
    const intervalKey = `refresh:${dashboardId}`;

    // Clear existing interval
    if (socket[intervalKey]) {
      clearInterval(socket[intervalKey]);
    }

    // Set new interval
    socket[intervalKey] = setInterval(async () => {
      try {
        const rendered = await DashboardService.render(dashboardId, {
          skipViewTracking: true,
          autoRefresh: true
        });

        socket.emit('dashboard:data', rendered);
      } catch (error) {
        logger.error('Auto-refresh failed', {
          dashboardId,
          error: error.message
        });
      }
    }, intervalSeconds * 1000);
  }

  /**
   * Stop auto-refresh for dashboard
   */
  _stopDashboardRefresh(socket, dashboardId) {
    const intervalKey = `refresh:${dashboardId}`;

    if (socket[intervalKey]) {
      clearInterval(socket[intervalKey]);
      delete socket[intervalKey];
    }
  }

  /**
   * Broadcast dashboard update to all subscribers
   */
  async broadcastDashboardUpdate(dashboardId) {
    try {
      const rendered = await DashboardService.render(dashboardId, {
        skipViewTracking: true,
        autoRefresh: true
      });

      this.io.to(`dashboard:${dashboardId}`).emit('dashboard:update', rendered);

      logger.info('Dashboard update broadcast', {
        dashboardId,
        subscribers: this.dashboardRooms.get(dashboardId)?.size || 0
      });
    } catch (error) {
      logger.error('Failed to broadcast dashboard update', {
        dashboardId,
        error: error.message
      });
    }
  }

  /**
   * Broadcast visualization update
   */
  async broadcastVisualizationUpdate(visualizationId) {
    // Find all dashboards containing this visualization and broadcast updates
    const { DashboardItem } = require('../models');

    const items = await DashboardItem.findAll({
      where: { visualizationId },
      attributes: ['dashboardId'],
      group: ['dashboardId']
    });

    for (const item of items) {
      await this.broadcastDashboardUpdate(item.dashboardId);
    }
  }

  /**
   * Send custom event to all connected clients
   */
  broadcast(event, data) {
    this.io.emit(event, data);
    logger.debug('Broadcast event', { event, dataKeys: Object.keys(data) });
  }

  /**
   * Send custom event to specific dashboard subscribers
   */
  sendToDashboard(dashboardId, event, data) {
    this.io.to(`dashboard:${dashboardId}`).emit(event, data);
  }

  /**
   * Get connection statistics
   */
  getStatistics() {
    const stats = {
      totalConnections: this.io.sockets.sockets.size,
      dashboardSubscriptions: this.dashboardRooms.size,
      subscriptionDetails: []
    };

    for (const [dashboardId, sockets] of this.dashboardRooms.entries()) {
      stats.subscriptionDetails.push({
        dashboardId,
        subscribers: sockets.size
      });
    }

    return stats;
  }
}

module.exports = new RealtimeService();
