/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Moderator Service
 * Main application server
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('./utils/logger');

// Routes
const moderationRoutes = require('../routes/moderation');
const reviewRoutes = require('../routes/review');
const reportsRoutes = require('../routes/reports');
const rulesRoutes = require('../routes/rules');
const appealsRoutes = require('../routes/appeals');
const workflowRoutes = require('../routes/workflows');
const healthRoutes = require('../routes/health');
const metricsRoutes = require('../routes/metrics');
const actionsRoutes = require('../routes/actions');
const setupRoutes = require('../routes/setup');

// Services
const moderationActions = require('../services/moderationActions');
const queueService = require('../services/queueService');
const appealService = require('../services/appealService');
const agentFramework = require('../services/agentFramework');
const emailService = require('../services/emailService');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3006;

// ═══════════════════════════════════════════════════════════
// Socket.IO Configuration
// ═══════════════════════════════════════════════════════════

const io = socketIO(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Socket.IO namespaces
const moderationNamespace = io.of('/moderation');
const notificationsNamespace = io.of('/notifications');

// Handle moderation namespace connections
moderationNamespace.on('connection', (socket) => {
  logger.info('Moderator connected', {
    socketId: socket.id,
    ip: socket.handshake.address
  });

  // Join moderators room
  socket.join('moderators');

  // Optionally join admins room (would check auth token in production)
  if (socket.handshake.query.role === 'admin') {
    socket.join('admins');
    logger.info('Admin joined admins room', { socketId: socket.id });
  }

  socket.on('disconnect', () => {
    logger.info('Moderator disconnected', { socketId: socket.id });
  });
});

// Handle notifications namespace connections
notificationsNamespace.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId) {
    socket.join(`user:${userId}`);
    logger.info('User connected to notifications', {
      socketId: socket.id,
      userId
    });
  }

  socket.on('disconnect', () => {
    logger.info('User disconnected from notifications', {
      socketId: socket.id,
      userId
    });
  });
});

// Set Socket.IO server in services
moderationActions.setSocketServer(io);
queueService.setSocketServer(io);
appealService.setSocketServer(io);

logger.info('Socket.IO server initialized', {
  namespaces: ['/moderation', '/notifications']
});

// ═══════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving
const path = require('path');
app.use(express.static(path.join(__dirname, '..', 'public')));

// Request logging
app.use((req, res, next) => {
  logger.http(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// ═══════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════

app.use('/health', healthRoutes);
app.use('/api/moderate', moderationRoutes);
app.use('/api/queue', reviewRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/appeals', appealsRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/actions', actionsRoutes);
app.use('/api/config', require('./routes/config'));
app.use('/api/setup', setupRoutes);

// View routes - serve HTML interfaces
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'dashboard.html'));
});

app.get('/queue', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'queue.html'));
});

app.get('/reports', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'reports.html'));
});

app.get('/rules', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'rules.html'));
});

app.get('/appeals', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'appeals.html'));
});

app.get('/workflows', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'workflows.html'));
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Exprsn Moderator',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      moderation: '/api/moderate',
      reviewQueue: '/api/queue',
      reports: '/api/reports',
      rules: '/api/rules',
      appeals: '/api/appeals',
      workflows: '/api/workflows'
    },
    views: {
      dashboard: '/dashboard',
      queue: '/queue',
      reports: '/reports',
      rules: '/rules',
      appeals: '/appeals',
      workflows: '/workflows'
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════════════════════

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'Endpoint not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });

  res.status(err.status || 500).json({
    error: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'An error occurred'
      : err.message
  });
});

// ═══════════════════════════════════════════════════════════
// Server Startup
// ═══════════════════════════════════════════════════════════

server.listen(PORT, async () => {
  logger.info(`Exprsn Moderator Service started`, {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    pid: process.pid,
    socketIO: 'enabled'
  });

  // Log configured AI providers
  const aiProviders = [];
  if (process.env.CLAUDE_API_KEY) aiProviders.push('Claude');
  if (process.env.OPENAI_API_KEY) aiProviders.push('OpenAI');
  if (process.env.DEEPSEEK_API_KEY) aiProviders.push('DeepSeek');

  logger.info(`AI Providers configured: ${aiProviders.join(', ') || 'None'}`);

  // Initialize AI agent framework
  try {
    // Register agent implementations
    const TextModerationAgent = require('../services/agents/TextModerationAgent');
    const ImageModerationAgent = require('../services/agents/ImageModerationAgent');
    const VideoModerationAgent = require('../services/agents/VideoModerationAgent');
    const RateLimitDetectionAgent = require('../services/agents/RateLimitDetectionAgent');

    agentFramework.registerAgentImplementation(TextModerationAgent);
    agentFramework.registerAgentImplementation(ImageModerationAgent);
    agentFramework.registerAgentImplementation(VideoModerationAgent);
    agentFramework.registerAgentImplementation(RateLimitDetectionAgent);

    await agentFramework.initialize();
    logger.info('AI Agent Framework initialized');

    // Initialize email service
    await emailService.initialize();
    logger.info('Email Service initialized');

  } catch (error) {
    logger.error('Failed to initialize services', {
      error: error.message
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection', { error: err.message, stack: err.stack });
  process.exit(1);
});

module.exports = app;
