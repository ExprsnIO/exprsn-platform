const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chalk = require('chalk');

/**
 * Generate random secret
 */
function generateSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate environment-specific defaults
 */
function getEnvironmentDefaults(environment) {
  const defaults = {
    production: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      LOG_FORMAT: 'json',
      ENABLE_METRICS: 'true',
      BCRYPT_ROUNDS: '12',
      TOKEN_CACHE_TTL: '60',
      CACHE_TTL: '300',
      RATE_LIMIT_API: '100',
      RATE_LIMIT_AUTH: '10',
      WEBHOOK_TIMEOUT: '5000',
      WEBHOOK_MAX_RETRIES: '3'
    },
    staging: {
      NODE_ENV: 'staging',
      LOG_LEVEL: 'debug',
      LOG_FORMAT: 'json',
      ENABLE_METRICS: 'true',
      BCRYPT_ROUNDS: '10',
      TOKEN_CACHE_TTL: '60',
      CACHE_TTL: '300',
      RATE_LIMIT_API: '200',
      RATE_LIMIT_AUTH: '20',
      WEBHOOK_TIMEOUT: '5000',
      WEBHOOK_MAX_RETRIES: '3'
    },
    dev: {
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug',
      LOG_FORMAT: 'text',
      ENABLE_METRICS: 'false',
      BCRYPT_ROUNDS: '8',
      TOKEN_CACHE_TTL: '60',
      CACHE_TTL: '300',
      RATE_LIMIT_API: '1000',
      RATE_LIMIT_AUTH: '100',
      WEBHOOK_TIMEOUT: '10000',
      WEBHOOK_MAX_RETRIES: '5'
    },
    testing: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      LOG_FORMAT: 'text',
      ENABLE_METRICS: 'false',
      BCRYPT_ROUNDS: '4',
      TOKEN_CACHE_TTL: '10',
      CACHE_TTL: '60',
      RATE_LIMIT_API: '10000',
      RATE_LIMIT_AUTH: '1000',
      WEBHOOK_TIMEOUT: '1000',
      WEBHOOK_MAX_RETRIES: '1'
    }
  };

  return defaults[environment] || defaults.production;
}

/**
 * Generate .env file content
 */
function generateEnvContent(config) {
  const { environment = 'production', database = {}, redis = {}, rabbitmq = {}, application = {}, ssl = {} } = config;

  const envDefaults = getEnvironmentDefaults(environment);

  // Generate secrets if not provided
  const jwtSecret = application.jwtSecret || generateSecret(32);
  const encryptionKey = application.encryptionKey || generateSecret(32);
  const sessionSecret = application.sessionSecret || generateSecret(32);

  const sections = [];

  // Node Environment
  sections.push('# Node Environment');
  sections.push(`NODE_ENV=${envDefaults.NODE_ENV}`);
  sections.push('');

  // Server Configuration
  sections.push('# Server Configuration');
  sections.push(`PORT=${application.apiPort || 3000}`);
  sections.push(`SOCKET_PORT=${application.socketPort || 3001}`);
  sections.push(`HOST=${application.host || '0.0.0.0'}`);
  sections.push('');

  // Database Configuration
  sections.push('# Database Configuration');
  sections.push(`DB_HOST=${database.host || 'localhost'}`);
  sections.push(`DB_PORT=${database.port || 5432}`);
  sections.push(`DB_NAME=${database.database || 'exprsn_platform'}`);
  sections.push(`DB_USER=${database.username || 'postgres'}`);
  sections.push(`DB_PASSWORD=${database.password || 'changeme'}`);
  sections.push(`DB_POOL_MIN=${database.poolMin || 2}`);
  sections.push(`DB_POOL_MAX=${database.poolMax || 10}`);
  sections.push(`DB_SSL=${database.ssl ? 'true' : 'false'}`);
  sections.push('');

  // Redis Configuration
  sections.push('# Redis Configuration');
  sections.push(`REDIS_HOST=${redis.host || 'localhost'}`);
  sections.push(`REDIS_PORT=${redis.port || 6379}`);
  sections.push(`REDIS_PASSWORD=${redis.password || ''}`);
  sections.push(`REDIS_DB=${redis.db || 0}`);
  sections.push(`CACHE_TTL=${redis.cacheTTL || envDefaults.CACHE_TTL}`);
  sections.push(`TOKEN_CACHE_TTL=${redis.tokenCacheTTL || envDefaults.TOKEN_CACHE_TTL}`);
  sections.push('');

  // RabbitMQ Configuration
  sections.push('# RabbitMQ Configuration');
  sections.push(`RABBITMQ_HOST=${rabbitmq.host || 'localhost'}`);
  sections.push(`RABBITMQ_PORT=${rabbitmq.port || 5672}`);
  sections.push(`RABBITMQ_USER=${rabbitmq.username || 'guest'}`);
  sections.push(`RABBITMQ_PASSWORD=${rabbitmq.password || 'guest'}`);
  sections.push(`RABBITMQ_VHOST=${rabbitmq.vhost || '/'}`);
  sections.push('');

  // Security Configuration
  sections.push('# Security Configuration');
  sections.push(`JWT_SECRET=${jwtSecret}`);
  sections.push(`ENCRYPTION_KEY=${encryptionKey}`);
  sections.push(`SESSION_SECRET=${sessionSecret}`);
  sections.push(`BCRYPT_ROUNDS=${envDefaults.BCRYPT_ROUNDS}`);
  sections.push('');

  // CORS Configuration
  sections.push('# CORS Configuration');
  sections.push(`CORS_ORIGIN=${application.corsOrigins || '*'}`);
  sections.push(`CORS_CREDENTIALS=true`);
  sections.push('');

  // Rate Limiting
  sections.push('# Rate Limiting');
  sections.push(`RATE_LIMIT_API=${envDefaults.RATE_LIMIT_API}`);
  sections.push(`RATE_LIMIT_AUTH=${envDefaults.RATE_LIMIT_AUTH}`);
  sections.push('');

  // SSL/TLS Configuration
  sections.push('# SSL/TLS Configuration');
  sections.push(`CA_ROOT_CERT_PATH=${ssl.caRootCertPath || './certs/ca/root-ca.crt'}`);
  sections.push(`CA_ROOT_KEY_PATH=${ssl.caRootKeyPath || './certs/ca/root-ca.key'}`);
  sections.push(`CA_INTERMEDIATE_CERT_PATH=${ssl.caIntermediateCertPath || './certs/ca/intermediate-ca.crt'}`);
  sections.push(`CA_INTERMEDIATE_KEY_PATH=${ssl.caIntermediateKeyPath || './certs/ca/intermediate-ca.key'}`);
  sections.push(`SERVER_CERT_PATH=${ssl.serverCertPath || './certs/server/server.crt'}`);
  sections.push(`SERVER_KEY_PATH=${ssl.serverKeyPath || './certs/server/server.key'}`);
  sections.push(`CA_VALIDITY_DAYS=${ssl.caValidityDays || 3650}`);
  sections.push(`SERVER_VALIDITY_DAYS=${ssl.serverValidityDays || 365}`);
  sections.push(`OPENSSL_KEY_BITS=${ssl.opensslKeyBits || 4096}`);
  sections.push(`OPENSSL_DIGEST=${ssl.opensslDigest || 'sha256'}`);
  sections.push('');

  // Token Configuration
  sections.push('# Token Configuration');
  sections.push(`TOKEN_LIFETIME=${application.tokenLifetime || 3600}`);
  sections.push(`TOKEN_BINDING_ENABLED=${application.tokenBindingEnabled || 'true'}`);
  sections.push(`TOKEN_CACHE_ENABLED=${application.tokenCacheEnabled || 'true'}`);
  sections.push('');

  // Logging Configuration
  sections.push('# Logging Configuration');
  sections.push(`LOG_LEVEL=${application.logLevel || envDefaults.LOG_LEVEL}`);
  sections.push(`LOG_FORMAT=${envDefaults.LOG_FORMAT}`);
  sections.push(`LOG_DIR=${application.logDir || './logs'}`);
  sections.push(`LOG_MAX_SIZE=${application.logMaxSize || '20m'}`);
  sections.push(`LOG_MAX_FILES=${application.logMaxFiles || '14d'}`);
  sections.push('');

  // Metrics Configuration
  sections.push('# Metrics Configuration');
  sections.push(`ENABLE_METRICS=${application.enableMetrics !== false ? 'true' : 'false'}`);
  sections.push(`METRICS_PORT=${application.metricsPort || 9090}`);
  sections.push('');

  // Webhook Configuration
  sections.push('# Webhook Configuration');
  sections.push(`WEBHOOK_TIMEOUT=${envDefaults.WEBHOOK_TIMEOUT}`);
  sections.push(`WEBHOOK_MAX_RETRIES=${envDefaults.WEBHOOK_MAX_RETRIES}`);
  sections.push(`WEBHOOK_BACKOFF_BASE=${application.webhookBackoffBase || 1000}`);
  sections.push('');

  // Socket.io Configuration
  sections.push('# Socket.io Configuration');
  sections.push(`SOCKET_PING_TIMEOUT=${application.socketPingTimeout || 60000}`);
  sections.push(`SOCKET_PING_INTERVAL=${application.socketPingInterval || 25000}`);
  sections.push(`SOCKET_TRANSPORTS=${application.socketTransports || 'polling,websocket'}`);
  sections.push('');

  return sections.join('\n');
}

/**
 * Write .env file
 */
function writeEnvFile(outputPath, content, options = {}) {
  const { backup = true, overwrite = false } = options;

  // Resolve path
  const resolvedPath = path.resolve(outputPath);

  // Check if file exists
  if (fs.existsSync(resolvedPath) && !overwrite) {
    if (backup) {
      const backupPath = `${resolvedPath}.backup.${Date.now()}`;
      fs.copyFileSync(resolvedPath, backupPath);
      console.log(chalk.yellow(`⚠ Existing file backed up to: ${backupPath}`));
    } else {
      throw new Error(`File already exists: ${resolvedPath}. Use --overwrite to replace it.`);
    }
  }

  // Write file
  fs.writeFileSync(resolvedPath, content, 'utf8');

  // Set permissions (600 - only owner can read/write)
  if (process.platform !== 'win32') {
    fs.chmodSync(resolvedPath, 0o600);
  }

  return resolvedPath;
}

/**
 * Read existing .env file
 */
function readEnvFile(filePath) {
  const resolvedPath = path.resolve(filePath.replace(/^~/, require('os').homedir()));

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf8');
  const config = {};

  // Parse .env file
  content.split('\n').forEach(line => {
    line = line.trim();

    // Skip comments and empty lines
    if (!line || line.startsWith('#')) {
      return;
    }

    // Parse key=value
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      config[key] = value;
    }
  });

  return config;
}

/**
 * Merge environment configurations
 */
function mergeEnvConfigs(...configs) {
  return Object.assign({}, ...configs);
}

/**
 * Validate environment file
 */
function validateEnvFile(config) {
  const requiredVars = [
    'NODE_ENV',
    'PORT',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'REDIS_HOST',
    'REDIS_PORT',
    'JWT_SECRET',
    'ENCRYPTION_KEY'
  ];

  const missing = requiredVars.filter(varName => !config[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate JWT secret length
  if (config.JWT_SECRET && config.JWT_SECRET.length < 32) {
    console.warn(chalk.yellow('⚠ Warning: JWT_SECRET should be at least 32 characters'));
  }

  // Validate encryption key length
  if (config.ENCRYPTION_KEY && config.ENCRYPTION_KEY.length < 32) {
    console.warn(chalk.yellow('⚠ Warning: ENCRYPTION_KEY should be at least 32 characters'));
  }

  return true;
}

/**
 * Generate environment file from configuration
 */
async function generateEnvFile(config, outputPath, options = {}) {
  try {
    // Generate content
    const content = generateEnvContent(config);

    // Validate before writing
    const parsedConfig = {};
    content.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        parsedConfig[match[1].trim()] = match[2].trim();
      }
    });

    validateEnvFile(parsedConfig);

    // Write file
    const writtenPath = writeEnvFile(outputPath, content, options);

    console.log(chalk.green(`✓ Environment file created: ${writtenPath}`));

    // Print summary
    console.log(chalk.blue('\n📋 Environment Configuration Summary:'));
    console.log(chalk.gray(`   Environment: ${config.environment || 'production'}`));
    console.log(chalk.gray(`   Database: ${parsedConfig.DB_HOST}:${parsedConfig.DB_PORT}/${parsedConfig.DB_NAME}`));
    console.log(chalk.gray(`   Redis: ${parsedConfig.REDIS_HOST}:${parsedConfig.REDIS_PORT}`));
    console.log(chalk.gray(`   API Port: ${parsedConfig.PORT}`));
    console.log(chalk.gray(`   Socket Port: ${parsedConfig.SOCKET_PORT}`));

    return writtenPath;
  } catch (error) {
    console.error(chalk.red(`✖ Failed to generate environment file: ${error.message}`));
    throw error;
  }
}

module.exports = {
  generateSecret,
  getEnvironmentDefaults,
  generateEnvContent,
  writeEnvFile,
  readEnvFile,
  mergeEnvConfigs,
  validateEnvFile,
  generateEnvFile
};
