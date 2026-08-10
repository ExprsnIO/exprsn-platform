/**
 * ═══════════════════════════════════════════════════════════════════════
 * Bridge IPC Router
 *
 * Central routing hub for all inter-service communication:
 * - Routes Socket.IO events between services
 * - Handles CRUD operations
 * - Manages JSONLex expression execution
 * - Provides rate limiting for IPC calls
 * - Maintains connection state
 * ═══════════════════════════════════════════════════════════════════════
 */

const IPCWorker = require('../../../shared/ipc/IPCWorker');
const JSONLex = require('../../../shared/utils/jsonlex');
const Redis = require('ioredis');
const logger = require('../config/logger');

class IPCRouter {
  constructor(io, options = {}) {
    this.io = io;
    this.serviceName = 'exprsn-bridge';

    // IPC Worker
    this.ipc = new IPCWorker({
      serviceName: this.serviceName,
      namespace: 'ipc'
    });

    // Redis for rate limiting and state
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: process.env.REDIS_DB || 0,
      keyPrefix: 'ipc:router:'
    });

    // Service connections map (service -> socket.io namespace)
    this.services = new Map();

    // Active connections
    this.connections = new Map();

    // Rate limiting config
    this.rateLimits = {
      enabled: process.env.IPC_RATE_LIMIT !== 'false',
      window: parseInt(process.env.IPC_RATE_WINDOW) || 60000, // 1 minute
      maxRequests: parseInt(process.env.IPC_RATE_MAX) || 1000
    };

    this._initialize();
  }

  /**
   * Initialize IPC router
   * @private
   */
  async _initialize() {
    // Set up IPC event handlers
    this.ipc.on('crud:create', this._handleCreate.bind(this));
    this.ipc.on('crud:read', this._handleRead.bind(this));
    this.ipc.on('crud:update', this._handleUpdate.bind(this));
    this.ipc.on('crud:delete', this._handleDelete.bind(this));
    this.ipc.on('jsonlex:execute', this._handleJSONLex.bind(this));

    // Set up Socket.IO namespaces for each service
    this._setupSocketNamespaces();

    // Handle IPC ready event
    this.ipc.on('ready', () => {
      logger.info('IPC Router initialized', {
        service: this.serviceName,
        rateLimiting: this.rateLimits.enabled
      });
    });

    // Handle errors
    this.ipc.on('error', (error) => {
      logger.error('IPC Router error', {
        error: error.message,
        stack: error.stack
      });
    });

    logger.info('IPC Router starting...');
  }

  /**
   * Setup Socket.IO namespaces for services
   * @private
   */
  _setupSocketNamespaces() {
    const services = [
      'ca', 'auth', 'spark', 'timeline', 'prefetch', 'moderator',
      'filevault', 'gallery', 'live', 'nexus', 'pulse', 'vault',
      'herald', 'setup', 'workflow', 'payments', 'atlas', 'svr'
    ];

    services.forEach(service => {
      const namespace = this.io.of(`/ipc/${service}`);

      namespace.on('connection', (socket) => {
        this._handleServiceConnection(service, socket);
      });

      this.services.set(service, namespace);
    });

    logger.info('Socket.IO namespaces created', {
      count: services.length,
      services
    });
  }

  /**
   * Handle service connection
   * @private
   */
  _handleServiceConnection(service, socket) {
    const connectionId = `${service}:${socket.id}`;

    logger.info('Service connected to IPC', {
      service,
      socketId: socket.id,
      connectionId
    });

    // Store connection
    this.connections.set(connectionId, {
      service,
      socket,
      connected: Date.now(),
      lastActivity: Date.now()
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      this.connections.delete(connectionId);
      logger.info('Service disconnected from IPC', {
        service,
        socketId: socket.id
      });
    });

    // Handle incoming events
    socket.on('ipc:emit', async (data) => {
      await this._handleSocketEmit(service, socket, data);
    });

    // Handle CRUD operations
    socket.on('ipc:create', async (data, callback) => {
      await this._handleSocketCRUD(service, socket, 'create', data, callback);
    });

    socket.on('ipc:read', async (data, callback) => {
      await this._handleSocketCRUD(service, socket, 'read', data, callback);
    });

    socket.on('ipc:update', async (data, callback) => {
      await this._handleSocketCRUD(service, socket, 'update', data, callback);
    });

    socket.on('ipc:delete', async (data, callback) => {
      await this._handleSocketCRUD(service, socket, 'delete', data, callback);
    });

    // Handle JSONLex execution
    socket.on('ipc:jsonlex', async (data, callback) => {
      await this._handleSocketJSONLex(service, socket, data, callback);
    });
  }

  /**
   * Handle Socket.IO emit from service
   * @private
   */
  async _handleSocketEmit(source, socket, data) {
    const { event, payload, target = 'broadcast', options = {} } = data;

    try {
      // Check rate limit
      if (this.rateLimits.enabled && !options.rateLimitExempt) {
        const allowed = await this._checkRateLimit(source);
        if (!allowed) {
          socket.emit('ipc:error', {
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'IPC rate limit exceeded'
          });
          return;
        }
      }

      // Emit via IPC worker
      await this.ipc.emit(event, payload, {
        target,
        source,
        ...options
      });

      socket.emit('ipc:ack', { event, target });
    } catch (error) {
      logger.error('Socket emit error', {
        source,
        event,
        error: error.message
      });

      socket.emit('ipc:error', {
        error: 'EMIT_FAILED',
        message: error.message
      });
    }
  }

  /**
   * Handle Socket.IO CRUD operation
   * @private
   */
  async _handleSocketCRUD(source, socket, operation, data, callback) {
    try {
      // Check rate limit
      if (this.rateLimits.enabled) {
        const allowed = await this._checkRateLimit(source);
        if (!allowed) {
          if (callback) {
            callback({
              success: false,
              error: 'RATE_LIMIT_EXCEEDED'
            });
          }
          return;
        }
      }

      // Execute CRUD operation via IPC
      const result = await this.ipc[operation](
        data.resource,
        operation === 'create' ? data.data : data.query || data.id,
        operation === 'update' ? data.data : undefined,
        data.options || {}
      );

      if (callback) {
        callback({
          success: true,
          data: result
        });
      }
    } catch (error) {
      logger.error(`CRUD ${operation} error`, {
        source,
        resource: data.resource,
        error: error.message
      });

      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Handle Socket.IO JSONLex execution
   * @private
   */
  async _handleSocketJSONLex(source, socket, data, callback) {
    try {
      const { expression, context = {}, options = {} } = data;

      // Check rate limit
      if (this.rateLimits.enabled) {
        const allowed = await this._checkRateLimit(source);
        if (!allowed) {
          if (callback) {
            callback({
              success: false,
              error: 'RATE_LIMIT_EXCEEDED'
            });
          }
          return;
        }
      }

      // Execute JSONLex expression
      const result = JSONLex.evaluate(expression, context);

      if (callback) {
        callback({
          success: true,
          result
        });
      }
    } catch (error) {
      logger.error('JSONLex execution error', {
        source,
        error: error.message
      });

      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Handle IPC CRUD operations
   */
  async _handleCreate(data, meta) {
    logger.debug('IPC Create', {
      source: meta.source,
      resource: data.resource
    });
    // Route to appropriate service handler
    await this._routeToService(meta.source, 'crud:create', data);
  }

  async _handleRead(data, meta) {
    logger.debug('IPC Read', {
      source: meta.source,
      resource: data.resource
    });
    await this._routeToService(meta.source, 'crud:read', data);
  }

  async _handleUpdate(data, meta) {
    logger.debug('IPC Update', {
      source: meta.source,
      resource: data.resource,
      id: data.id
    });
    await this._routeToService(meta.source, 'crud:update', data);
  }

  async _handleDelete(data, meta) {
    logger.debug('IPC Delete', {
      source: meta.source,
      resource: data.resource,
      id: data.id
    });
    await this._routeToService(meta.source, 'crud:delete', data);
  }

  async _handleJSONLex(data, meta) {
    logger.debug('IPC JSONLex', {
      source: meta.source
    });

    // Execute JSONLex locally and emit result
    const result = JSONLex.evaluate(data.expression, data.context);
    await this._routeToService(meta.source, 'jsonlex:result', { result });
  }

  /**
   * Route event to target service via Socket.IO
   * @private
   */
  async _routeToService(target, event, data) {
    const namespace = this.services.get(target);

    if (!namespace) {
      logger.warn('Target service not found', { target });
      return;
    }

    // Emit to all connections in the namespace
    namespace.emit(event, data);
  }

  /**
   * Check rate limit for service
   * @private
   */
  async _checkRateLimit(service) {
    if (!this.rateLimits.enabled) {
      return true;
    }

    const key = `ratelimit:${service}`;
    const current = await this.redis.get(key);
    const count = current ? parseInt(current) : 0;

    if (count >= this.rateLimits.maxRequests) {
      return false;
    }

    await this.redis.multi()
      .incr(key)
      .pexpire(key, this.rateLimits.window)
      .exec();

    return true;
  }

  /**
   * Get IPC statistics
   */
  async getStats() {
    const services = await this.ipc.getActiveServices();

    return {
      activeServices: services.length,
      services,
      activeConnections: this.connections.size,
      connections: Array.from(this.connections.entries()).map(([id, conn]) => ({
        id,
        service: conn.service,
        connected: conn.connected,
        lastActivity: conn.lastActivity
      })),
      rateLimits: this.rateLimits
    };
  }

  /**
   * Cleanup
   */
  async shutdown() {
    logger.info('Shutting down IPC Router...');

    await this.ipc.disconnect();
    await this.redis.quit();

    logger.info('IPC Router shut down');
  }
}

module.exports = IPCRouter;
