/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Moderator Module
 * In-process module behind the unified platform gateway
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const express = require('express');
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

// Services
const moderationActions = require('../services/moderationActions');
const queueService = require('../services/queueService');
const appealService = require('../services/appealService');
const agentFramework = require('../services/agentFramework');
const emailService = require('../services/emailService');

const app = express();

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

// Request logging
app.use((req, res, next) => {
  logger.http(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// ═══════════════════════════════════════════════════════════
// Routes (JSON API only)
// ═══════════════════════════════════════════════════════════

app.use('/health', healthRoutes);
app.use('/api/moderate', moderationRoutes);
app.use('/api/queue', reviewRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/agents', require('../routes/agents'));
app.use('/api/wordlists', require('../routes/wordlists'));
app.use('/api/queues', require('../routes/queues'));
app.use('/api/appeals', appealsRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/actions', actionsRoutes);
app.use('/api/config', require('./routes/config'));
// Service-to-service notification ingest → /notifications socket namespace.
// (timeline's Herald client posts here; HERALD_SERVICE_URL -> /moderator)
app.use('/api/notifications', require('./routes/notifications'));

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
// Socket.IO Wiring
// ═══════════════════════════════════════════════════════════

/**
 * Wire the moderator namespaces onto the gateway's shared io instance.
 * TODO(platform): verify socket auth/namespace wiring
 */
function registerSockets(io) {
  const moderationNamespace = io.of('/moderation');
  const notificationsNamespace = io.of('/notifications');

  // Publish the notifications namespace so the HTTP notification-ingest route
  // (src/routes/notifications.js) can emit to connected users.
  app.set('notificationsNs', notificationsNamespace);

  // Shared CA-bearer validation for both namespaces. Validate directly against
  // the CA's /api/tokens/validate ({ token, ... }) with identity-bound service
  // headers, mirroring the timeline socket validator. (The shared
  // caTokenValidator posts `tokenId`, which the CA rejects as invalid.)
  const axios = require('axios');
  const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
  const { isPlatformAdmin } = require('@exprsn/shared/utils/platformAdmin');
  const caUrl = process.env.CA_URL || process.env.CA_BASE_URL || 'http://localhost:3000';
  const serviceHeaders = () => {
    const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME;
    if (!serviceId) return {};
    try {
      return { 'X-Service-ID': serviceId, 'X-Service-Token': deriveServiceToken(serviceId) };
    } catch (err) {
      logger.warn('Service identity not available for moderator socket auth', { error: err.message });
      return {};
    }
  };
  const validateBearer = async (socket) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return null;
    const { data } = await axios.post(
      `${caUrl}/api/tokens/validate`,
      { token, requiredPermissions: { read: true } },
      { timeout: 5000, headers: serviceHeaders() }
    );
    if (!data.valid || !data.userId) return null;
    return { userId: data.userId, email: data.tokenData && data.tokenData.email };
  };

  // The /moderation namespace carries sensitive moderation events; require a
  // valid CA bearer AND platform-admin identity (same source of truth as the
  // moderator HTTP admin endpoints). Privilege comes from the validated token —
  // never from a client-supplied handshake query.
  moderationNamespace.use(async (socket, next) => {
    try {
      const identity = await validateBearer(socket);
      if (!identity) return next(new Error('Authentication failed'));
      if (!isPlatformAdmin(identity.email)) return next(new Error('Forbidden'));
      socket.userId = identity.userId;
      next();
    } catch (err) {
      logger.warn('Moderation socket auth error', { error: err.message });
      next(new Error('Authentication failed'));
    }
  });

  // Handle moderation namespace connections (all are validated platform admins)
  moderationNamespace.on('connection', (socket) => {
    logger.info('Moderator connected', {
      socketId: socket.id,
      userId: socket.userId,
      ip: socket.handshake.address
    });

    socket.join('moderators');

    socket.on('disconnect', () => {
      logger.info('Moderator disconnected', { socketId: socket.id, userId: socket.userId });
    });
  });

  // The /notifications namespace authenticates each socket from the CA bearer
  // and binds it to its own `user:{userId}` room. The user id comes from the
  // validated token — never from a client-supplied handshake query — so a client
  // cannot subscribe to another user's notifications.
  notificationsNamespace.use(async (socket, next) => {
    try {
      const identity = await validateBearer(socket);
      if (!identity) return next(new Error('Authentication failed'));
      socket.userId = identity.userId;
      next();
    } catch (err) {
      logger.warn('Notifications socket auth error', { error: err.message });
      next(new Error('Authentication failed'));
    }
  });

  // Handle notifications namespace connections
  notificationsNamespace.on('connection', (socket) => {
    const userId = socket.userId;
    socket.join(`user:${userId}`);
    logger.info('User connected to notifications', { socketId: socket.id, userId });

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

  logger.info('Socket.IO namespaces wired', {
    namespaces: ['/moderation', '/notifications']
  });
}

// ═══════════════════════════════════════════════════════════
// Module Initialization
// ═══════════════════════════════════════════════════════════

/**
 * Initialize db, redis, bull queue workers and AI clients.
 * Called once by the platform gateway. NEVER listens on a port.
 */
async function init(ctx) {
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

  // Queue registry (live Redis/Bull buckets) + workflow execution engine.
  try {
    const queueRegistry = require('../services/queueRegistry');
    await queueRegistry.ensureLiveQueues();
    const workflowEngine = require('../services/workflowEngine');
    await workflowEngine.init();
    logger.info('Queue registry + workflow engine initialized');
  } catch (error) {
    logger.error('Failed to initialize queue/workflow engine', { error: error.message });
  }
}

module.exports = {
  name: 'moderator',
  app,
  registerSockets,
  init
};
