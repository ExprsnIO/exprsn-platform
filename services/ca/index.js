/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Certificate Authority - Platform Module (API-only)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * This module exposes the CA as an in-process module behind a unified
 * gateway. It exports an Express app (no server/listen, no view engine,
 * no static assets, no setup routes), a registerSockets(io) hook, and an
 * async init(ctx) for startup work.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const morgan = require('morgan');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./models');
const { getStorage } = require('./storage');
const IPCWorker = require('../shared/ipc/IPCWorker');
const { bypassAll, logBypassStatus } = require('../shared/middleware/devBypass');

// ═══════════════════════════════════════════════════════════════════════
// Initialize Express Application
// ═══════════════════════════════════════════════════════════════════════

const app = express();

// Log bypass status on startup
logBypassStatus();

// Initialize IPC Worker
const ipc = new IPCWorker({
  serviceName: 'exprsn-ca',
  namespace: 'ipc'
});

// IPC Event Handlers
ipc.on('ready', () => {
  logger.info('IPC Worker ready for inter-service communication');
});

ipc.on('error', (error) => {
  logger.error('IPC Worker error', {
    error: error.message,
    stack: error.stack
  });
});

// Listen for certificate validation requests from other services
ipc.on('cert:validate', async (data, meta) => {
  const { certificateId, serialNumber } = data;

  logger.debug('Certificate validation request received', {
    certificateId,
    serialNumber,
    source: meta.source
  });

  try {
    const { Certificate } = require('./models');
    const cert = certificateId
      ? await Certificate.findByPk(certificateId)
      : await Certificate.findOne({ where: { serialNumber } });

    await ipc.emit('cert:validated', {
      certificateId: cert?.id,
      serialNumber: cert?.serialNumber,
      valid: cert && cert.status === 'active',
      status: cert?.status,
      notBefore: cert?.notBefore,
      notAfter: cert?.notAfter
    }, {
      target: meta.source
    });
  } catch (error) {
    logger.error('Certificate validation failed', { error: error.message });
    await ipc.emit('cert:validated', {
      certificateId,
      serialNumber,
      valid: false,
      error: error.message
    }, {
      target: meta.source
    });
  }
});

// Listen for token validation requests
ipc.on('token:validate', async (data, meta) => {
  const { tokenId } = data;

  logger.debug('Token validation request received', {
    tokenId,
    source: meta.source
  });

  try {
    const { Token } = require('./models');
    const token = await Token.findByPk(tokenId);

    await ipc.emit('token:validated', {
      tokenId,
      valid: token && token.status === 'active' && new Date() < new Date(token.expiresAt),
      status: token?.status,
      expiresAt: token?.expiresAt,
      permissions: token?.permissions
    }, {
      target: meta.source
    });
  } catch (error) {
    logger.error('Token validation failed', { error: error.message });
    await ipc.emit('token:validated', {
      tokenId,
      valid: false,
      error: error.message
    }, {
      target: meta.source
    });
  }
});

// ───────────────────────────────────────────────────────────────────────
// Middleware
// ───────────────────────────────────────────────────────────────────────

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"] // Allow WebSocket connections
    }
  }
}));

// CORS - explicit allowlist from CORS_ORIGIN (comma-separated).
// With credentials enabled, a wildcard origin is never allowed; if no
// allowlist is configured, cross-origin requests are disabled entirely.
const corsAllowedOrigins = (process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: corsAllowedOrigins.length > 0 ? corsAllowedOrigins : false,
  credentials: true
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session middleware (store reference for socket.io).
// Redis-backed store on the shared Redis when enabled (matches auth/spark/etc),
// otherwise express-session's MemoryStore (dev only — per-process, leaks, does
// not survive restarts). Mirrors services/auth/src/index.js.
let sessionStore; // undefined -> express-session MemoryStore
if (config.redis.enabled) {
  try {
    const connectRedis = require('connect-redis');
    const RedisStore = connectRedis.RedisStore || connectRedis.default || connectRedis;
    const { createClient } = require('redis');

    const sessionRedisClient = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port
      },
      ...(config.redis.password && { password: config.redis.password })
    });

    sessionRedisClient.on('error', (err) => {
      logger.error('Session Redis client error', { error: err.message });
    });

    sessionRedisClient.connect().catch((err) => {
      logger.error('Failed to connect session Redis client', { error: err.message });
    });

    sessionStore = new RedisStore({
      client: sessionRedisClient,
      prefix: 'exprsn:ca:sess:'
    });

    logger.info('Session store: Redis');
  } catch (error) {
    logger.error('Failed to initialize Redis session store', { error: error.message });
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
  }
}

if (!sessionStore && process.env.NODE_ENV !== 'production') {
  logger.warn(
    'Session store: in-memory MemoryStore (DEV ONLY). Set REDIS_ENABLED=true to use Redis.'
  );
}

const sessionMiddleware = session({
  ...(sessionStore && { store: sessionStore }),
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.session.secure,
    httpOnly: true,
    maxAge: config.session.maxAge,
    sameSite: config.session.sameSite
  }
});

app.use(sessionMiddleware);

// Development bypass middleware (MUST come before auth middleware)
app.use(bypassAll);

// Make IPC available to all routes
app.use((req, res, next) => {
  req.ipc = ipc;
  next();
});

// Logging
if (config.app.env === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: { write: message => logger.info(message.trim()) }
  }));
}

// Request ID and user context
app.use((req, res, next) => {
  req.id = require('uuid').v4();
  req.logger = logger.child({ requestId: req.id });
  next();
});

// Attach user to request context
const { attachUserToLocals } = require('./middleware/auth');
app.use(attachUserToLocals);

// ───────────────────────────────────────────────────────────────────────
// Routes (JSON API only)
// ───────────────────────────────────────────────────────────────────────

app.use('/ca', require('./routes/ca'));
app.use('/certificates', require('./routes/certificates'));
app.use('/tokens', require('./routes/tokens'));
app.use('/users', require('./routes/users'));
app.use('/groups', require('./routes/groups'));
app.use('/roles', require('./routes/roles'));
app.use('/tickets', require('./routes/tickets'));
app.use('/ocsp', require('./routes/ocsp'));
app.use('/crl', require('./routes/crl'));
app.use('/acme', require('./acme')); // ACME v2 (RFC 8555) — path must stay /acme so JWS url checks match CA_BASE_URL
app.use('/api', require('./routes/api'));
app.use('/api/config', require('./routes/config'));
app.use('/admin', require('./routes/admin'));

// ───────────────────────────────────────────────────────────────────────
// Error Handling (JSON only - API module)
// ───────────────────────────────────────────────────────────────────────

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      status: 404,
      message: 'Not Found'
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  // Use req.logger if available, otherwise fallback to global logger
  const errorLogger = req.logger || logger;
  errorLogger.error('Application error:', err);

  const status = err.status || 500;
  const message = config.app.env === 'development' ? err.message : 'Internal Server Error';

  res.status(status).json({
    error: {
      status,
      message,
      ...(config.app.env === 'development' && { stack: err.stack })
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Socket.IO Registration
// ═══════════════════════════════════════════════════════════════════════

/**
 * Attach realtime handlers to the unified gateway's Socket.IO server.
 * Wires the CA handlers (previously set up via socketService.initialize)
 * onto the '/ca' namespace.
 *
 * @param {import('socket.io').Server} io
 */
function registerSockets(io) {
  // TODO(platform): verify socket auth/namespace wiring
  const nsp = io.of('/ca');
  const socketService = require('./services/socket');
  socketService.attach(nsp, sessionMiddleware);
  logger.info('Socket.IO handlers attached to /ca namespace');
}

// ═══════════════════════════════════════════════════════════════════════
// Async Initialization (db / redis / storage / IPC) - NEVER listens
// ═══════════════════════════════════════════════════════════════════════

/**
 * Async startup work for the module. Connects to backing services but
 * NEVER creates a server or listens on a port.
 *
 * @param {Object} [ctx] Platform-provided context
 */
async function init(ctx = {}) {
  logger.info('Initializing Exprsn Certificate Authority module...');

  // Initialize IPC transport (event handlers are registered at module load)
  if (typeof ipc.connect === 'function') {
    await ipc.connect();
  }

  // Validate configuration
  const configErrors = config.validate();
  if (configErrors.length > 0) {
    logger.warn('Configuration warnings:', configErrors);
  }

  // Initialize Redis cache
  logger.info('Connecting to Redis cache...');
  const redisClient = require('./utils/redis');
  await redisClient.connect();
  if (redisClient.isEnabled && redisClient.isConnected) {
    logger.info('Redis cache connected successfully');
  } else {
    logger.warn('Redis cache disabled or unavailable - continuing without caching');
  }

  // Initialize database
  logger.info('Connecting to database...');
  await db.sequelize.authenticate();
  logger.info('Database connected successfully');

  // Sync database models (use migrations in production)
  // NOTE: Disabled auto-sync since schema is managed via database/schema.sql
  logger.info('Using existing database schema from database/schema.sql');

  // Initialize storage
  logger.info('Initializing storage layer...');
  const storage = getStorage();
  await storage.initialize();
  logger.info('Storage initialized successfully');

  // Check and auto-generate root CA certificate if missing
  logger.info('Checking for root CA certificate...');
  const { Certificate } = require('./models');
  const rootCert = await Certificate.findOne({
    where: { type: 'root', status: 'active' }
  });

  if (!rootCert) {
    logger.warn('Root CA certificate not found. Auto-generating...');
    try {
      const crypto = require('./crypto');
      const certData = await crypto.generateRootCertificate({
        commonName: config.ca.name || 'Exprsn Root CA',
        country: config.ca.country || 'US',
        state: config.ca.state || '',
        locality: config.ca.locality || '',
        organization: config.ca.organization || 'Exprsn',
        organizationalUnit: config.ca.organizationalUnit || 'Certificate Authority',
        email: config.ca.email || 'ca@exprsn.io',
        keySize: 4096,
        validityDays: 7300 // 20 years
      });

      const newRootCert = await Certificate.create({
        serialNumber: certData.serialNumber,
        type: 'root',
        userId: null, // System-generated
        issuerId: null, // Self-signed
        commonName: config.ca.name || 'Exprsn Root CA',
        organization: config.ca.organization || 'Exprsn',
        organizationalUnit: config.ca.organizationalUnit || 'Certificate Authority',
        country: config.ca.country || 'US',
        state: config.ca.state || '',
        locality: config.ca.locality || '',
        email: config.ca.email || 'ca@exprsn.io',
        keySize: 4096,
        algorithm: 'RSA-SHA256',
        publicKey: certData.publicKey,
        certificatePem: certData.certificate,
        fingerprint: certData.fingerprint,
        notBefore: certData.notBefore,
        notAfter: certData.notAfter,
        status: 'active',
        storagePath: `certs/${certData.serialNumber}.pem`
      });

      // Save certificate and private key to storage
      await storage.saveCertificate(newRootCert.id, certData.certificate);
      await storage.savePrivateKey(newRootCert.id, certData.privateKey);

      logger.info('Root CA certificate auto-generated successfully', {
        id: newRootCert.id,
        serialNumber: newRootCert.serialNumber,
        commonName: newRootCert.commonName
      });
    } catch (error) {
      logger.error('Failed to auto-generate root CA certificate:', error);
      logger.warn('CRL and OCSP services may not function until root CA is manually created');
    }
  } else {
    logger.info('Root CA certificate found', {
      id: rootCert.id,
      serialNumber: rootCert.serialNumber
    });
  }

  // Initialize services
  logger.info('Initializing services...');
  try {
    await require('./services/crl').initialize();
    logger.info('CRL service initialized successfully');
  } catch (error) {
    logger.warn('CRL service initialization failed (will retry when root cert is available):', error.message);
  }
  logger.info('Services initialized successfully');

  logger.info('Exprsn Certificate Authority initialized successfully');
}

// ═══════════════════════════════════════════════════════════════════════
// Optional Standalone Mode (not used when loaded as a platform module)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Standalone bootstrap: runs init(), then creates its own HTTPS server and
 * Socket.IO instance. Only used when this service runs as its own process
 * (direct invocation or cluster.js). The unified gateway must NOT call this.
 */
async function start() {
  await init();

  const { HTTPSServerManager } = require('../shared/utils/httpsServer');

  const serverManager = new HTTPSServerManager({
    serviceName: 'exprsn-ca',
    port: config.app.port || 3000,
    httpsPort: config.app.port || 3000,
    httpPort: (config.app.port || 3000) + 9, // HTTP on 3009 for redirect
    enableHTTP: true,
    redirectHTTP: true
  });

  const servers = await serverManager.start(app);
  const server = servers.https || servers.http;

  // Initialize Socket.IO on the standalone server
  const { Server } = require('socket.io');
  const io = new Server(server, {
    cors: {
      origin: corsAllowedOrigins.length > 0 ? corsAllowedOrigins : false,
      credentials: true
    },
    transports: ['websocket', 'polling']
  });
  registerSockets(io);

  logger.info(`Environment: ${config.app.env}`);
  logger.info(`Storage: ${config.storage.type}`);
  logger.info('Socket.IO: WebSocket support enabled');
  logger.info('IPC: Inter-service communication enabled');

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    if (ipc && typeof ipc.disconnect === 'function') await ipc.disconnect();
    server.close(async () => {
      await db.sequelize.close();
      logger.info('Server shut down successfully');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

// Run standalone only when invoked directly.
if (require.main === module) {
  start().catch(error => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Module Export Contract
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'ca',
  app,
  registerSockets,
  init
};

// Standalone helper (used by cluster.js / direct invocation only; the unified
// gateway uses app + init + registerSockets and never calls start()).
module.exports.start = start;
