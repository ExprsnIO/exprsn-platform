/**
 * Socket.io Server
 */

const http = require('http');
const { Server } = require('socket.io');
const config = require('../config');
const logger = require('../utils/logger');

// Create HTTP server
const server = http.createServer();

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  },
  transports: config.socket.transports,
  pingTimeout: config.socket.pingTimeout,
  pingInterval: config.socket.pingInterval,
  maxHttpBufferSize: config.socket.maxHttpBufferSize,
});

// Connection handler
io.on('connection', (socket) => {
  logger.info('Socket client connected', {
    socketId: socket.id,
    address: socket.handshake.address,
  });

  // Authentication placeholder
  socket.on('authenticate', (data) => {
    logger.info('Socket authentication request', {
      socketId: socket.id,
    });

    // TODO: Implement token validation
    socket.emit('authenticated', {
      success: true,
      socketId: socket.id,
    });
  });

  // Admin events - subscribe to admin updates
  socket.on('admin:subscribe', (data) => {
    logger.info('Admin subscription request', {
      socketId: socket.id,
    });
    socket.join('admin');
  });

  socket.on('admin:unsubscribe', () => {
    socket.leave('admin');
  });

  // Disconnect handler
  socket.on('disconnect', (reason) => {
    logger.info('Socket client disconnected', {
      socketId: socket.id,
      reason,
    });
  });

  // Error handler
  socket.on('error', (error) => {
    logger.error('Socket error', {
      socketId: socket.id,
      error: error.message,
    });
  });
});

// Error handler
server.on('error', (error) => {
  logger.error('Socket server error', {
    error: error.message,
    stack: error.stack,
  });
});

// Export both server and io for admin events
module.exports = { server, io };
