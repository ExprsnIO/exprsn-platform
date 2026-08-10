/**
 * Exprsn Vault - Secure Secrets & Credentials Management
 *
 * This service provides secure storage and retrieval of secrets,
 * API keys, credentials, and other sensitive data for the Exprsn ecosystem.
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const {
  errorHandler,
  notFoundHandler,
  logger,
  initRedisClient
} = require('@exprsn/shared');
const config = require('./config');

const app = express();

// Initialize Redis for rate limiting
initRedisClient()
  .then(() => logger.info('Redis connected for rate limiting'))
  .catch(err => logger.warn('Redis connection failed, rate limiting may not work', { error: err.message }));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security - adjusted for dashboard
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:']
    }
  }
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'exprsn-vault',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Dashboards
app.get('/dashboard', (req, res) => {
  res.render('dashboard');
});

app.get('/admin', (req, res) => {
  res.render('admin-dashboard');
});

// Initialize database
const db = require('./models');

// Initialize Redis cache
const redisCache = require('./services/redisCache');

// Routes
app.use('/api/config', require('./routes/config'));
app.use('/api/secrets', require('./routes/secrets'));
app.use('/api/keys', require('./routes/keys'));
app.use('/api/credentials', require('./routes/credentials'));
app.use('/api/dynamic', require('./routes/dynamic'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/admin', require('./routes/admin'));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Exprsn Vault',
    version: '1.0.0',
    description: 'Secure Secrets & Credentials Management',
    endpoints: {
      health: '/health',
      dashboard: '/dashboard',
      adminDashboard: '/admin',
      secrets: '/api/secrets',
      keys: '/api/keys',
      credentials: '/api/credentials',
      dynamic: '/api/dynamic',
      audit: '/api/audit',
      config: '/api/config',
      admin: '/api/admin'
    }
  });
});

// 404 handler - use shared middleware
app.use(notFoundHandler);

// Error handler - use shared middleware with proper error formatting
app.use(errorHandler);

// Start server with Socket.IO
const port = config.port || 3013;
const http = require('http');
const server = http.createServer(app);

// Initialize Socket.IO
const socketService = require('./services/socketService');
socketService.initialize(server);

server.listen(port, () => {
  logger.info(`Exprsn Vault started on port ${port}`);
  logger.info('Socket.IO enabled for real-time updates');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  socketService.disconnectAll('Server shutdown');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, socketService};
