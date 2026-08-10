/**
 * ═══════════════════════════════════════════════════════════
 * Configuration Management
 * Loads and validates environment variables
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();

const config = {
  // Application
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5001,
  serviceName: process.env.SERVICE_NAME || 'exprsn-svr',

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'exprsn_svr',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    dialect: 'postgres',
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
      min: parseInt(process.env.DB_POOL_MIN, 10) || 5,
      acquire: 30000,
      idle: 10000
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false
  },

  // Redis
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    cacheTTL: parseInt(process.env.CACHE_TTL, 10) || 3600
  },

  // CA Integration
  ca: {
    url: process.env.CA_URL || 'http://localhost:3000',
    verifyTokens: process.env.CA_VERIFY_TOKENS === 'true',
    publicKeyPath: process.env.CA_PUBLIC_KEY_PATH || './keys/ca-public.pem'
  },

  // Security
  security: {
    sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
    enableSQLInjectionDetection: process.env.ENABLE_SQL_INJECTION_DETECTION === 'true',
    enableXSSProtection: process.env.ENABLE_XSS_PROTECTION === 'true',
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
  },

  // Code Execution
  codeExecution: {
    enabled: process.env.CODE_EXECUTION_ENABLED === 'true',
    timeout: parseInt(process.env.CODE_EXECUTION_TIMEOUT, 10) || 5000,
    memoryLimit: parseInt(process.env.CODE_EXECUTION_MEMORY_LIMIT, 10) || 128
  },

  // Socket.IO
  socketIO: {
    enabled: process.env.SOCKET_IO_ENABLED === 'true',
    path: process.env.SOCKET_IO_PATH || '/socket.io',
    corsOrigins: (process.env.SOCKET_IO_CORS_ORIGINS || '').split(',').filter(Boolean)
  },

  // File Storage
  storage: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760, // 10MB
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    staticDir: process.env.STATIC_DIR || './public'
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || './logs',
    maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 30
  }
};

// Validate critical configuration
function validateConfig() {
  const errors = [];

  if (!config.database.password && config.env === 'production') {
    errors.push('DB_PASSWORD is required in production');
  }

  if (config.security.sessionSecret === 'dev-secret-change-in-production' && config.env === 'production') {
    errors.push('SESSION_SECRET must be set in production');
  }

  if (config.security.jwtSecret === 'dev-jwt-secret-change-in-production' && config.env === 'production') {
    errors.push('JWT_SECRET must be set in production');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Validate on load
validateConfig();

module.exports = config;
