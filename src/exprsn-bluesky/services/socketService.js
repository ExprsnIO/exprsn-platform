const { logger } = require('@exprsn/shared');
const { authenticateSocket } = require('../middleware/socketAuth');

let handlers = {};

function setupSocketHandlers(io, reload = false) {
  if (reload) {
    logger.info('Reloading socket handlers');
    // Clear existing handlers
    handlers = {};
  }

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    logger.info('Client connected', {
      socketId: socket.id,
      userId: socket.user?.id,
      did: socket.user?.did
    });

    // Subscribe to firehose
    socket.on('subscribe:firehose', (options = {}) => {
      const { collections, cursor } = options;
      const room = collections?.length ? `firehose:${collections.join(',')}` : 'firehose:all';

      socket.join(room);
      logger.info('Client subscribed to firehose', {
        socketId: socket.id,
        room,
        cursor
      });

      socket.emit('subscribed:firehose', {
        room,
        cursor: cursor || null
      });
    });

    // Unsubscribe from firehose
    socket.on('unsubscribe:firehose', () => {
      const rooms = Array.from(socket.rooms).filter(r => r.startsWith('firehose:'));
      rooms.forEach(room => socket.leave(room));

      logger.info('Client unsubscribed from firehose', {
        socketId: socket.id,
        rooms
      });
    });

    // Subscribe to user notifications
    socket.on('subscribe:notifications', () => {
      if (!socket.user?.did) {
        socket.emit('error', { message: 'Authentication required' });
        return;
      }

      const room = `notifications:${socket.user.did}`;
      socket.join(room);

      logger.info('Client subscribed to notifications', {
        socketId: socket.id,
        did: socket.user.did
      });

      socket.emit('subscribed:notifications', { did: socket.user.did });
    });

    // Subscribe to repository updates
    socket.on('subscribe:repo', (did) => {
      const room = `repo:${did}`;
      socket.join(room);

      logger.info('Client subscribed to repo', {
        socketId: socket.id,
        did
      });

      socket.emit('subscribed:repo', { did });
    });

    // Unsubscribe from repository
    socket.on('unsubscribe:repo', (did) => {
      const room = `repo:${did}`;
      socket.leave(room);

      logger.info('Client unsubscribed from repo', {
        socketId: socket.id,
        did
      });
    });

    // Client ping/pong for keepalive
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Disconnect handler
    socket.on('disconnect', (reason) => {
      logger.info('Client disconnected', {
        socketId: socket.id,
        userId: socket.user?.id,
        reason
      });
    });

    // Error handler
    socket.on('error', (error) => {
      logger.error('Socket error', {
        socketId: socket.id,
        error: error.message
      });
    });
  });

  logger.info('Socket.IO handlers set up successfully');
}

// Emit events to specific rooms
function emitToRoom(io, room, event, data) {
  io.to(room).emit(event, data);
}

// Emit firehose event
function emitFirehoseEvent(io, event, collections = []) {
  // Emit to all subscribers
  emitToRoom(io, 'firehose:all', 'firehose:event', event);

  // Emit to collection-specific subscribers
  if (collections.length > 0) {
    collections.forEach(collection => {
      emitToRoom(io, `firehose:${collection}`, 'firehose:event', event);
    });
  }
}

// Emit notification to user
function emitNotification(io, did, notification) {
  emitToRoom(io, `notifications:${did}`, 'notification', notification);
}

// Emit repository update
function emitRepoUpdate(io, did, update) {
  emitToRoom(io, `repo:${did}`, 'repo:update', update);
}

module.exports = {
  setupSocketHandlers,
  emitToRoom,
  emitFirehoseEvent,
  emitNotification,
  emitRepoUpdate
};
