const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

/**
 * Validate environment name
 */
function validateEnvironment(env) {
  const validEnvs = ['production', 'staging', 'dev', 'testing'];
  if (!validEnvs.includes(env)) {
    throw new Error(`Invalid environment: ${env}. Must be one of: ${validEnvs.join(', ')}`);
  }
  return true;
}

/**
 * Validate port number
 */
function validatePort(port) {
  const portNum = parseInt(port);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    throw new Error(`Invalid port: ${port}. Must be between 1 and 65535`);
  }
  return true;
}

/**
 * Validate host
 */
function validateHost(host) {
  if (!host || typeof host !== 'string' || host.trim().length === 0) {
    throw new Error('Invalid host: Host cannot be empty');
  }
  // Simple validation - could be IP or hostname
  return true;
}

/**
 * Validate database configuration
 */
function validateDatabaseConfig(config) {
  const required = ['host', 'port', 'database', 'username'];

  for (const field of required) {
    if (!config[field]) {
      throw new Error(`Database configuration missing required field: ${field}`);
    }
  }

  validateHost(config.host);
  validatePort(config.port);

  if (config.poolMin && config.poolMax) {
    const min = parseInt(config.poolMin);
    const max = parseInt(config.poolMax);
    if (min > max) {
      throw new Error('Database pool minimum cannot be greater than maximum');
    }
  }

  return true;
}

/**
 * Validate Redis configuration
 */
function validateRedisConfig(config) {
  const required = ['host', 'port'];

  for (const field of required) {
    if (!config[field]) {
      throw new Error(`Redis configuration missing required field: ${field}`);
    }
  }

  validateHost(config.host);
  validatePort(config.port);

  if (config.db !== undefined) {
    const db = parseInt(config.db);
    if (isNaN(db) || db < 0 || db > 15) {
      throw new Error('Redis database number must be between 0 and 15');
    }
  }

  return true;
}

/**
 * Validate RabbitMQ configuration
 */
function validateRabbitMQConfig(config) {
  const required = ['host', 'port', 'username'];

  for (const field of required) {
    if (!config[field]) {
      throw new Error(`RabbitMQ configuration missing required field: ${field}`);
    }
  }

  validateHost(config.host);
  validatePort(config.port);

  return true;
}

/**
 * Validate file path
 */
function validateFilePath(filePath, shouldExist = false) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid file path');
  }

  const expandedPath = filePath.replace(/^~/, require('os').homedir());

  if (shouldExist && !fs.existsSync(expandedPath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  return expandedPath;
}

/**
 * Validate directory path
 */
function validateDirectoryPath(dirPath, shouldExist = false, createIfMissing = false) {
  if (!dirPath || typeof dirPath !== 'string') {
    throw new Error('Invalid directory path');
  }

  const expandedPath = dirPath.replace(/^~/, require('os').homedir());

  if (shouldExist && !fs.existsSync(expandedPath)) {
    if (createIfMissing) {
      fs.mkdirSync(expandedPath, { recursive: true });
    } else {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }
  }

  if (fs.existsSync(expandedPath)) {
    const stats = fs.statSync(expandedPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${dirPath}`);
    }
  }

  return expandedPath;
}

/**
 * Validate SSH key
 */
function validateSSHKey(keyPath) {
  const expandedPath = validateFilePath(keyPath, true);

  try {
    const stats = fs.statSync(expandedPath);
    // Check permissions (should be 600 or 400)
    const mode = stats.mode & parseInt('777', 8);
    if (mode !== parseInt('600', 8) && mode !== parseInt('400', 8)) {
      console.warn(chalk.yellow(`⚠ Warning: SSH key permissions are ${mode.toString(8)}, should be 600 or 400`));
    }
  } catch (error) {
    throw new Error(`Cannot access SSH key: ${error.message}`);
  }

  return expandedPath;
}

/**
 * Validate cloud provider
 */
function validateCloudProvider(provider) {
  const validProviders = ['digitalocean', 'aws', 'azure'];
  if (!validProviders.includes(provider)) {
    throw new Error(`Invalid cloud provider: ${provider}. Must be one of: ${validProviders.join(', ')}`);
  }
  return true;
}

/**
 * Validate deployment platform
 */
function validatePlatform(platform) {
  const validPlatforms = ['ubuntu', 'fedora', 'macos', 'auto'];
  if (!validPlatforms.includes(platform)) {
    throw new Error(`Invalid platform: ${platform}. Must be one of: ${validPlatforms.join(', ')}`);
  }
  return true;
}

/**
 * Validate JWT secret
 */
function validateJWTSecret(secret) {
  if (secret && secret.length < 32) {
    console.warn(chalk.yellow('⚠ Warning: JWT secret should be at least 32 characters for security'));
  }
  return true;
}

/**
 * Validate encryption key
 */
function validateEncryptionKey(key) {
  if (key && key.length < 32) {
    console.warn(chalk.yellow('⚠ Warning: Encryption key should be at least 32 characters for security'));
  }
  return true;
}

/**
 * Validate URL
 */
function validateURL(url) {
  try {
    new URL(url);
    return true;
  } catch (error) {
    throw new Error(`Invalid URL: ${url}`);
  }
}

/**
 * Validate email
 */
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error(`Invalid email: ${email}`);
  }
  return true;
}

/**
 * Validate IP address
 */
function validateIP(ip) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

  if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
    throw new Error(`Invalid IP address: ${ip}`);
  }

  if (ipv4Regex.test(ip)) {
    const parts = ip.split('.');
    for (const part of parts) {
      const num = parseInt(part);
      if (num < 0 || num > 255) {
        throw new Error(`Invalid IP address: ${ip}`);
      }
    }
  }

  return true;
}

/**
 * Validate configuration object
 */
function validateConfiguration(config) {
  const errors = [];

  // Validate environment
  try {
    validateEnvironment(config.environment || 'production');
  } catch (error) {
    errors.push(error.message);
  }

  // Validate database if present
  if (config.database) {
    try {
      validateDatabaseConfig(config.database);
    } catch (error) {
      errors.push(error.message);
    }
  }

  // Validate Redis if present
  if (config.redis) {
    try {
      validateRedisConfig(config.redis);
    } catch (error) {
      errors.push(error.message);
    }
  }

  // Validate RabbitMQ if present
  if (config.rabbitmq) {
    try {
      validateRabbitMQConfig(config.rabbitmq);
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  return true;
}

/**
 * Sanitize environment variables
 */
function sanitizeEnvValue(value) {
  if (typeof value !== 'string') {
    return value;
  }

  // Remove leading/trailing whitespace
  let sanitized = value.trim();

  // Remove quotes if present
  if ((sanitized.startsWith('"') && sanitized.endsWith('"')) ||
      (sanitized.startsWith("'") && sanitized.endsWith("'"))) {
    sanitized = sanitized.slice(1, -1);
  }

  return sanitized;
}

module.exports = {
  validateEnvironment,
  validatePort,
  validateHost,
  validateDatabaseConfig,
  validateRedisConfig,
  validateRabbitMQConfig,
  validateFilePath,
  validateDirectoryPath,
  validateSSHKey,
  validateCloudProvider,
  validatePlatform,
  validateJWTSecret,
  validateEncryptionKey,
  validateURL,
  validateEmail,
  validateIP,
  validateConfiguration,
  sanitizeEnvValue
};
