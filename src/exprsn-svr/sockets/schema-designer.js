/**
 * ═══════════════════════════════════════════════════════════
 * Schema Designer Socket.IO Handler
 * Real-time collaboration for visual schema designer
 * ═══════════════════════════════════════════════════════════
 */

const {
  SchemaDefinition,
  SchemaTable,
  SchemaColumn,
  SchemaRelationship
} = require('../models');

class SchemaDesignerSocket {
  constructor(io) {
    this.io = io;
    this.namespace = io.of('/schema-designer');
    this.setupHandlers();
    this.activeUsers = new Map(); // schemaId -> Set of socket.id
  }

  setupHandlers() {
    this.namespace.on('connection', (socket) => {
      console.log(`Schema Designer: Client connected ${socket.id}`);

      // Join schema room
      socket.on('join:schema', async (data) => {
        await this.handleJoinSchema(socket, data);
      });

      // Leave schema room
      socket.on('leave:schema', async (data) => {
        await this.handleLeaveSchema(socket, data);
      });

      // Table events
      socket.on('table:add', async (data) => {
        await this.handleTableAdd(socket, data);
      });

      socket.on('table:update', async (data) => {
        await this.handleTableUpdate(socket, data);
      });

      socket.on('table:delete', async (data) => {
        await this.handleTableDelete(socket, data);
      });

      socket.on('table:move', async (data) => {
        await this.handleTableMove(socket, data);
      });

      // Column events
      socket.on('column:add', async (data) => {
        await this.handleColumnAdd(socket, data);
      });

      socket.on('column:update', async (data) => {
        await this.handleColumnUpdate(socket, data);
      });

      socket.on('column:delete', async (data) => {
        await this.handleColumnDelete(socket, data);
      });

      // Relationship events
      socket.on('relationship:add', async (data) => {
        await this.handleRelationshipAdd(socket, data);
      });

      socket.on('relationship:delete', async (data) => {
        await this.handleRelationshipDelete(socket, data);
      });

      // Cursor tracking
      socket.on('cursor:move', (data) => {
        this.handleCursorMove(socket, data);
      });

      // Selection events
      socket.on('selection:change', (data) => {
        this.handleSelectionChange(socket, data);
      });

      // Disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  /**
   * Handle join schema room
   */
  async handleJoinSchema(socket, data) {
    const { schemaId, userId, userName } = data;

    try {
      // Verify schema exists
      const schema = await SchemaDefinition.findByPk(schemaId);
      if (!schema) {
        socket.emit('error', { message: 'Schema not found' });
        return;
      }

      // Join room
      socket.join(`schema:${schemaId}`);
      socket.schemaId = schemaId;
      socket.userId = userId;
      socket.userName = userName || 'Anonymous';

      // Track active user
      if (!this.activeUsers.has(schemaId)) {
        this.activeUsers.set(schemaId, new Set());
      }
      this.activeUsers.get(schemaId).add(socket.id);

      // Notify others
      socket.to(`schema:${schemaId}`).emit('user:joined', {
        socketId: socket.id,
        userId,
        userName: socket.userName,
        timestamp: new Date()
      });

      // Send current active users to new joiner
      const activeUsersInSchema = Array.from(this.activeUsers.get(schemaId) || [])
        .filter(sid => sid !== socket.id)
        .map(sid => {
          const s = this.namespace.sockets.get(sid);
          return s ? {
            socketId: sid,
            userId: s.userId,
            userName: s.userName
          } : null;
        })
        .filter(Boolean);

      socket.emit('users:list', {
        users: activeUsersInSchema
      });

      console.log(`User ${userName} joined schema ${schemaId}`);
    } catch (error) {
      console.error('Error joining schema:', error);
      socket.emit('error', { message: 'Failed to join schema' });
    }
  }

  /**
   * Handle leave schema room
   */
  async handleLeaveSchema(socket, data) {
    const { schemaId } = data;

    socket.leave(`schema:${schemaId}`);

    // Remove from active users
    if (this.activeUsers.has(schemaId)) {
      this.activeUsers.get(schemaId).delete(socket.id);
    }

    // Notify others
    socket.to(`schema:${schemaId}`).emit('user:left', {
      socketId: socket.id,
      userId: socket.userId,
      userName: socket.userName,
      timestamp: new Date()
    });
  }

  /**
   * Handle table add
   */
  async handleTableAdd(socket, data) {
    const { schemaId, table } = data;

    // Broadcast to others in room
    socket.to(`schema:${schemaId}`).emit('table:added', {
      table,
      userId: socket.userId,
      userName: socket.userName,
      timestamp: new Date()
    });
  }

  /**
   * Handle table update
   */
  async handleTableUpdate(socket, data) {
    const { schemaId, tableId, updates } = data;

    socket.to(`schema:${schemaId}`).emit('table:updated', {
      tableId,
      updates,
      userId: socket.userId,
      userName: socket.userName,
      timestamp: new Date()
    });
  }

  /**
   * Handle table delete
   */
  async handleTableDelete(socket, data) {
    const { schemaId, tableId } = data;

    socket.to(`schema:${schemaId}`).emit('table:deleted', {
      tableId,
      userId: socket.userId,
      userName: socket.userName,
      timestamp: new Date()
    });
  }

  /**
   * Handle table move (drag)
   */
  async handleTableMove(socket, data) {
    const { schemaId, tableId, x, y } = data;

    // Broadcast immediately for smooth real-time experience
    socket.to(`schema:${schemaId}`).emit('table:moved', {
      tableId,
      x,
      y,
      userId: socket.userId
    });
  }

  /**
   * Handle column add
   */
  async handleColumnAdd(socket, data) {
    const { schemaId, tableId, column } = data;

    socket.to(`schema:${schemaId}`).emit('column:added', {
      tableId,
      column,
      userId: socket.userId,
      userName: socket.userName,
      timestamp: new Date()
    });
  }

  /**
   * Handle column update
   */
  async handleColumnUpdate(socket, data) {
    const { schemaId, tableId, columnId, updates } = data;

    socket.to(`schema:${schemaId}`).emit('column:updated', {
      tableId,
      columnId,
      updates,
      userId: socket.userId,
      userName: socket.userName,
      timestamp: new Date()
    });
  }

  /**
   * Handle column delete
   */
  async handleColumnDelete(socket, data) {
    const { schemaId, tableId, columnId } = data;

    socket.to(`schema:${schemaId}`).emit('column:deleted', {
      tableId,
      columnId,
      userId: socket.userId,
      userName: socket.userName,
      timestamp: new Date()
    });
  }

  /**
   * Handle relationship add
   */
  async handleRelationshipAdd(socket, data) {
    const { schemaId, relationship } = data;

    socket.to(`schema:${schemaId}`).emit('relationship:added', {
      relationship,
      userId: socket.userId,
      userName: socket.userName,
      timestamp: new Date()
    });
  }

  /**
   * Handle relationship delete
   */
  async handleRelationshipDelete(socket, data) {
    const { schemaId, relationshipId } = data;

    socket.to(`schema:${schemaId}`).emit('relationship:deleted', {
      relationshipId,
      userId: socket.userId,
      userName: socket.userName,
      timestamp: new Date()
    });
  }

  /**
   * Handle cursor move
   */
  handleCursorMove(socket, data) {
    const { schemaId, x, y } = data;

    socket.to(`schema:${schemaId}`).emit('cursor:update', {
      socketId: socket.id,
      userId: socket.userId,
      userName: socket.userName,
      x,
      y
    });
  }

  /**
   * Handle selection change
   */
  handleSelectionChange(socket, data) {
    const { schemaId, selectedTableId, selectedColumnId } = data;

    socket.to(`schema:${schemaId}`).emit('selection:changed', {
      socketId: socket.id,
      userId: socket.userId,
      userName: socket.userName,
      selectedTableId,
      selectedColumnId
    });
  }

  /**
   * Handle disconnect
   */
  handleDisconnect(socket) {
    const schemaId = socket.schemaId;

    if (schemaId) {
      // Remove from active users
      if (this.activeUsers.has(schemaId)) {
        this.activeUsers.get(schemaId).delete(socket.id);
      }

      // Notify others
      socket.to(`schema:${schemaId}`).emit('user:left', {
        socketId: socket.id,
        userId: socket.userId,
        userName: socket.userName,
        timestamp: new Date()
      });
    }

    console.log(`Schema Designer: Client disconnected ${socket.id}`);
  }

  /**
   * Broadcast schema update to all users in schema
   */
  broadcastSchemaUpdate(schemaId, eventName, data) {
    this.namespace.to(`schema:${schemaId}`).emit(eventName, {
      ...data,
      timestamp: new Date()
    });
  }

  /**
   * Get active users for a schema
   */
  getActiveUsers(schemaId) {
    const socketIds = this.activeUsers.get(schemaId) || new Set();
    return Array.from(socketIds).map(sid => {
      const socket = this.namespace.sockets.get(sid);
      return socket ? {
        socketId: sid,
        userId: socket.userId,
        userName: socket.userName
      } : null;
    }).filter(Boolean);
  }
}

module.exports = SchemaDesignerSocket;
