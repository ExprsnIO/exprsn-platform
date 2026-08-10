/**
 * Main Configuration Module
 * Loads configuration from environment variables with support for Docker and native deployments
 */

require('dotenv').config();

const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  socketPort: parseInt(process.env.SOCKET_PORT, 10) || 3001,
  serviceType: process.env.SERVICE_TYPE || 'api', // api, socket, webhook-worker

  // Deployment mode
  deploymentMode: process.env.DEPLOYMENT_MODE || 'docker', // docker or native

  // API Configuration
  api: {
    version: process.env.API_VERSION || '1.0',
    baseUrl: process.env.API_BASE_URL || 'https://api.example.com',
    rateLimit: parseInt(process.env.API_RATE_LIMIT, 10) || 100,
    rateWindow: parseInt(process.env.API_RATE_WINDOW, 10) || 60000,
  },

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'exprsn',
    user: process.env.DB_USER || 'exprsn',
    password: process.env.DB_PASSWORD || 'password',
    pool: {
      min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
      max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
      idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 30000,
      connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 2000,
    },
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    cacheTTL: parseInt(process.env.REDIS_CACHE_TTL, 10) || 300,
    tokenCacheTTL: parseInt(process.env.REDIS_TOKEN_CACHE_TTL, 10) || 60,
  },

  // RabbitMQ Configuration
  rabbitmq: {
    host: process.env.RABBITMQ_HOST || 'localhost',
    port: parseInt(process.env.RABBITMQ_PORT, 10) || 5672,
    user: process.env.RABBITMQ_USER || 'guest',
    password: process.env.RABBITMQ_PASSWORD || 'guest',
    vhost: process.env.RABBITMQ_VHOST || '/',
    prefetch: parseInt(process.env.RABBITMQ_PREFETCH, 10) || 10,
  },

  // Certificate Authority Configuration
  ca: {
    rootPath: process.env.CA_ROOT_PATH || './certs/root-ca',
    intermediatePath: process.env.CA_INTERMEDIATE_PATH || './certs/intermediate',
    serverPath: process.env.CA_SERVER_PATH || './certs/server',
    signingKey: process.env.CA_SIGNING_KEY || './certs/intermediate/intermediate.key',
    signingCert: process.env.CA_SIGNING_CERT || './certs/intermediate/intermediate.crt',
    ocspEndpoint: process.env.CA_OCSP_ENDPOINT || 'http://ocsp.example.com',
    crlEndpoint: process.env.CA_CRL_ENDPOINT || 'http://crl.example.com',
    rootValidYears: parseInt(process.env.CA_ROOT_VALID_YEARS, 10) || 20,
    intermediateValidYears: parseInt(process.env.CA_INTERMEDIATE_VALID_YEARS, 10) || 10,
    certValidYears: parseInt(process.env.CA_CERT_VALID_YEARS, 10) || 1,
  },

  // OpenSSL Configuration
  openssl: {
    conf: process.env.OPENSSL_CONF || './certs/openssl.cnf',
    keyBits: parseInt(process.env.CA_KEY_BITS, 10) || 4096,
    digest: process.env.CA_DIGEST || 'sha256',
  },

  // Token Configuration
  token: {
    signingKey: process.env.TOKEN_SIGNING_KEY || './certs/server/server.key',
    signingCert: process.env.TOKEN_SIGNING_CERT || './certs/server/server.crt',
    defaultLifetime: parseInt(process.env.TOKEN_DEFAULT_LIFETIME, 10) || 3600,
    refreshLifetime: parseInt(process.env.TOKEN_REFRESH_LIFETIME, 10) || 604800,
    bindingRequired: process.env.TOKEN_BINDING_REQUIRED === 'true',
    cacheEnabled: process.env.TOKEN_CACHE_ENABLED !== 'false',
  },

  // Security Configuration
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
    jwtSecret: process.env.JWT_SECRET || 'change-this-secret',
    encryptionKey: process.env.ENCRYPTION_KEY || 'change-this-32-character-key!!',
    hmacSecret: process.env.HMAC_SECRET || 'change-this-hmac-secret',
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
    credentials: process.env.CORS_CREDENTIALS === 'true',
    maxAge: parseInt(process.env.CORS_MAX_AGE, 10) || 86400,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    skipSuccessful: process.env.RATE_LIMIT_SKIP_SUCCESSFUL === 'true',
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    directory: process.env.LOG_DIRECTORY || './logs',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14',
  },

  // Metrics Configuration
  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    port: parseInt(process.env.METRICS_PORT, 10) || 9090,
    path: process.env.METRICS_PATH || '/metrics',
  },

  // Webhook Configuration
  webhook: {
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT, 10) || 5000,
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES, 10) || 3,
    retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY, 10) || 1000,
    retryBackoff: process.env.WEBHOOK_RETRY_BACKOFF || 'exponential',
    signatureAlgorithm: process.env.WEBHOOK_SIGNATURE_ALGORITHM || 'sha256',
  },

  // Socket.io Configuration
  socket: {
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT, 10) || 60000,
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL, 10) || 25000,
    maxHttpBufferSize: parseInt(process.env.SOCKET_MAX_HTTP_BUFFER_SIZE, 10) || 1000000,
    transports: process.env.SOCKET_TRANSPORTS ? process.env.SOCKET_TRANSPORTS.split(',') : ['websocket', 'polling'],
  },

  // Custom Headers
  customHeaderPrefix: process.env.CUSTOM_HEADER_PREFIX || 'xprsn-',

  // External Services
  externalServices: {
    geolocation: {
      service: process.env.GEOLOCATION_SERVICE,
      apiKey: process.env.GEOLOCATION_API_KEY,
    },
    notification: {
      service: process.env.NOTIFICATION_SERVICE,
      apiKey: process.env.NOTIFICATION_API_KEY,
    },
  },

  // Development
  development: {
    debug: process.env.DEBUG || '',
    nodemonDelay: parseInt(process.env.NODEMON_DELAY, 10) || 2000,
  },
};

// Validate critical configuration
function validateConfig() {
  const errors = [];

  // Check database configuration
  if (!config.database.password || config.database.password === 'password') {
    if (config.env === 'production') {
      errors.push('Database password must be set in production');
    }
  }

  // Check security configuration
  if (config.security.jwtSecret === 'change-this-secret' && config.env === 'production') {
    errors.push('JWT secret must be changed in production');
  }

  if (config.security.encryptionKey === 'change-this-32-character-key!!' && config.env === 'production') {
    errors.push('Encryption key must be changed in production');
  }

  // Check deployment mode
  if (!['docker', 'native'].includes(config.deploymentMode)) {
    errors.push('DEPLOYMENT_MODE must be either "docker" or "native"');
  }

  if (errors.length > 0) {
    console.error('Configuration validation errors:');
    errors.forEach((error) => console.error(`  - ${error}`));
    if (config.env === 'production') {
      throw new Error('Invalid configuration for production environment');
    }
  }
}

// Run validation
validateConfig();

module.exports = config;
