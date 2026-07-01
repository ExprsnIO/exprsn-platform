/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Auth Service
 * Authentication & Authorization Service for Exprsn Ecosystem
 *
 * Platform module: exports { name, app, init }. The app is mounted
 * in-process behind the unified gateway. No server/listen, no view
 * engine, no static assets, no setup routes — API only.
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const { createLogger } = require('@exprsn/shared');
const { errorHandler, notFoundHandler } = require('@exprsn/shared');
const { initRedisClient } = require('@exprsn/shared');
const config = require('./config');
const db = require('./models');
const caService = require('./services/caService');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const groupRoutes = require('./routes/groups');
const tokenRoutes = require('./routes/tokens');
const oauth2Routes = require('./routes/oauth2');
const mfaRoutes = require('./routes/mfa');
const sessionRoutes = require('./routes/sessions');
const healthRoutes = require('./routes/health');
const organizationRoutes = require('./routes/organizations');
const applicationRoutes = require('./routes/applications');
const roleRoutes = require('./routes/roles');
const oidcRoutes = require('./routes/oidc');
const samlRoutes = require('./routes/saml');
const { resolveBearerIdentity } = require('./middleware/bearerAuth');

// Logger
const logger = createLogger('exprsn-auth');

// Express app
const app = express();

/**
 * ═══════════════════════════════════════════════════════════
 * Middleware
 * ═══════════════════════════════════════════════════════════
 */

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      "style-src": ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      "font-src": ["'self'", "cdn.jsdelivr.net"]
    }
  }
}));
// CORS: explicit comma-separated allowlist via CORS_ORIGIN. Never use a
// wildcard together with credentials. When unset, cross-origin requests are
// disabled (origin: false).
const corsAllowlist = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

if (corsAllowlist.length === 0) {
  logger.warn('CORS_ORIGIN not set - cross-origin requests are disabled');
}

app.use(cors({
  origin: corsAllowlist.length > 0 ? corsAllowlist : false,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session configuration
// SESSION_SECRET is required in production (config throws at load if it is
// unset or still the placeholder). Redis-backed store when Redis is enabled,
// otherwise MemoryStore (dev only - per-process, leaks, never for prod).
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
      prefix: 'exprsn:auth:sess:'
    });

    logger.info('Session store: Redis');
  } catch (error) {
    logger.error('Failed to initialize Redis session store', { error: error.message });
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
  }
}

if (!sessionStore) {
  if (process.env.NODE_ENV === 'production') {
    logger.error(
      'No Redis session store available in production. Enable REDIS_ENABLED=true - ' +
      'MemoryStore is per-process, leaks memory, and will break login flows behind the gateway.'
    );
  } else {
    logger.warn(
      'Session store: in-memory MemoryStore (DEV ONLY). Sessions are per-process and do not ' +
      'survive restarts. Set REDIS_ENABLED=true to use the Redis-backed store.'
    );
  }
}

app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  ...(sessionStore && { store: sessionStore }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: parseInt(process.env.SESSION_LIFETIME) || 3600000 // 1 hour
  }
}));

// Flash messages
app.use(flash());

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Bridge the SPA's CA bearer token to a session-equivalent identity (req.user)
// so the session-based requireAuth/RBAC stack accepts bearer-only callers.
// Falls through silently when there's no/invalid bearer or a real session.
app.use(resolveBearerIdentity);

// Request logging
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: req.user?.id
  });
  next();
});

/**
 * ═══════════════════════════════════════════════════════════
 * Routes (API only)
 * ═══════════════════════════════════════════════════════════
 */

// Health check (always public)
app.use('/health', healthRoutes);

// OIDC well-known endpoints (JSON discovery + token introspection/revocation)
app.use(oidcRoutes);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/mfa', mfaRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/oauth2', oauth2Routes);
app.use('/api/saml', samlRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/config', require('./routes/config'));
// Internal service-to-service org authorization lookups (HMAC service token only).
app.use('/api/internal', require('./routes/internal'));

/**
 * ═══════════════════════════════════════════════════════════
 * Error Handling
 * ═══════════════════════════════════════════════════════════
 */

app.use(notFoundHandler);
app.use(errorHandler);

/**
 * ═══════════════════════════════════════════════════════════
 * Module initialization (NEVER listens)
 *
 * Performs all pre-listen async setup: CA integration, Redis,
 * database connection, passport strategies, and system data.
 * The platform gateway calls init(ctx) before serving traffic.
 * ═══════════════════════════════════════════════════════════
 */

async function init(ctx = {}) {
  // Initialize CA service integration
  const caRequired = process.env.CA_REQUIRED === 'true';
  const caWait = process.env.CA_WAIT !== 'false'; // Default to true

  try {
    const caStatus = await caService.initialize({
      required: caRequired,
      wait: caWait,
      maxAttempts: parseInt(process.env.CA_MAX_ATTEMPTS) || 10
    });

    if (caStatus.configured) {
      if (caStatus.available) {
        logger.info('CA service integration initialized successfully');
      } else {
        logger.warn('CA service is configured but not available');
      }
    } else {
      logger.info('CA service not configured, running without CA integration');
    }
  } catch (error) {
    logger.error('CA service initialization failed', { error: error.message });
    if (caRequired) {
      throw error;
    }
  }

  // Initialize Redis if enabled
  if (process.env.REDIS_ENABLED === 'true') {
    await initRedisClient();
    logger.info('Redis client initialized');
  }

  // Database connection
  await db.sequelize.authenticate();
  logger.info('Database connection established');

  // Sync models (in development)
  // Temporarily disabled due to LDAP config sync issue
  // if (process.env.NODE_ENV === 'development') {
  //   await db.sequelize.sync({ alter: true });
  //   logger.info('Database models synchronized');
  // }

  // Configure passport strategies (local, OAuth providers, SAML)
  require('./config/passport')(passport);

  // Initialize system data (permissions and roles)
  await db.initializeSystemData();
  logger.info('System data initialized');

  return app;
}

module.exports = {
  name: 'auth',
  app,
  init
};

/**
 * ═══════════════════════════════════════════════════════════
 * Standalone mode (optional, local dev only)
 * Builds an HTTP/HTTPS server and listens. NOT used when running
 * in-process behind the platform gateway.
 * ═══════════════════════════════════════════════════════════
 */

if (require.main === module) {
  const http = require('http');
  const https = require('https');
  const fs = require('fs');
  const path = require('path');

  (async () => {
    try {
      await init();

      const port = process.env.AUTH_SERVICE_PORT || 3001;
      const tlsEnabled = process.env.TLS_ENABLED === 'true';
      let server;

      if (tlsEnabled) {
        const certPath = process.env.TLS_CERT_PATH || path.join(__dirname, '../certs/localhost-cert.pem');
        const keyPath = process.env.TLS_KEY_PATH || path.join(__dirname, '../certs/localhost-key.pem');

        if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
          logger.error('TLS certificates not found', { certPath, keyPath });
          logger.info('Falling back to HTTP mode');
          server = http.createServer(app);
        } else {
          const tlsOptions = {
            cert: fs.readFileSync(certPath),
            key: fs.readFileSync(keyPath)
          };

          server = https.createServer(tlsOptions, app);
          logger.info('TLS/HTTPS mode enabled');
        }
      } else {
        server = http.createServer(app);
        logger.info('HTTP mode (TLS disabled)');
      }

      server.listen(port, () => {
        const protocol = tlsEnabled && server instanceof https.Server ? 'https' : 'http';
        logger.info(`Exprsn Auth service listening on ${protocol}://localhost:${port}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`OIDC Issuer: ${process.env.OIDC_ISSUER || `${protocol}://localhost:${port}`}`);
      });
    } catch (error) {
      logger.error('Failed to start server', { error: error.message, stack: error.stack });
      process.exit(1);
    }
  })();

  // Handle shutdown gracefully (standalone only)
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await db.sequelize.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await db.sequelize.close();
    process.exit(0);
  });
}
