/**
 * ═══════════════════════════════════════════════════════════════════════
 * Enterprise Configuration Management Module
 * ═══════════════════════════════════════════════════════════════════════
 * Generate and manage .env files for all Exprsn services
 * Features:
 * - Schema-driven validation with comprehensive error reporting
 * - Environment-specific configuration (dev/staging/production)
 * - Configuration versioning and backup
 * - Schema introspection for dynamic UI generation
 * - Configuration diff and comparison
 * - Enterprise-level validation with detailed defaults
 * ═══════════════════════════════════════════════════════════════════════
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { SERVICE_DEFINITIONS } = require('./discovery');
const {
  caConfigSchema,
  timelineConfigSchema,
  nexusConfigSchema,
  vaultConfigSchema,
  getSchemaForService,
  getAllSchemas
} = require('../schemas/config-schemas');

/**
 * ───────────────────────────────────────────────────────────────────────
 * Utility Functions
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * Generate random secret
 * @param {number} length - Secret length in bytes
 * @returns {string} Random hex string
 */
function generateSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate UUID v4
 * @returns {string} UUID
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * ───────────────────────────────────────────────────────────────────────
 * Environment-Specific Defaults
 * ───────────────────────────────────────────────────────────────────────
 */

const ENVIRONMENT_PROFILES = {
  development: {
    NODE_ENV: 'development',
    LOG_LEVEL: 'debug',
    CORS_ORIGIN: '*',
    RATE_LIMIT_ENABLED: 'false',
    CACHE_ENABLED: 'true',
    METRICS_ENABLED: 'true',
    CLUSTER_ENABLED: 'false',
    SSL_ENABLED: 'false'
  },
  staging: {
    NODE_ENV: 'staging',
    LOG_LEVEL: 'info',
    CORS_ORIGIN: 'https://staging.exprsn.io',
    RATE_LIMIT_ENABLED: 'true',
    CACHE_ENABLED: 'true',
    METRICS_ENABLED: 'true',
    CLUSTER_ENABLED: 'true',
    SSL_ENABLED: 'true'
  },
  production: {
    NODE_ENV: 'production',
    LOG_LEVEL: 'warn',
    CORS_ORIGIN: 'https://exprsn.io',
    RATE_LIMIT_ENABLED: 'true',
    CACHE_ENABLED: 'true',
    METRICS_ENABLED: 'true',
    CLUSTER_ENABLED: 'true',
    SSL_ENABLED: 'true',
    OCSP_ENABLED: 'true',
    CRL_ENABLED: 'true'
  }
};

/**
 * ───────────────────────────────────────────────────────────────────────
 * Legacy Configuration Templates (Backward Compatibility)
 * ───────────────────────────────────────────────────────────────────────
 */

const LEGACY_CONFIG_TEMPLATES = {
  'exprsn-ca': {
    NODE_ENV: 'development',
    PORT: '3000',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'exprsn_ca_dev',
    DB_USER: 'postgres',
    DB_PASSWORD: '',
    REDIS_ENABLED: 'true',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    CA_NAME: 'Exprsn Root CA',
    CA_DOMAIN: 'ca.exprsn.io',
    CA_COUNTRY: 'US',
    CA_STATE: 'California',
    CA_LOCALITY: 'San Francisco',
    CA_ORGANIZATION: 'Exprsn',
    CA_ORGANIZATIONAL_UNIT: 'Certificate Authority',
    JWT_SECRET: () => generateSecret(64),
    SESSION_SECRET: () => generateSecret(32),
    OCSP_ENABLED: 'true',
    CRL_ENABLED: 'true',
    STORAGE_TYPE: 'postgresql',
    LOG_LEVEL: 'info'
  },
  'exprsn-timeline': {
    NODE_ENV: 'development',
    PORT: '3004',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'exprsn_ca_dev',
    DB_USER: 'postgres',
    DB_PASSWORD: '',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    CA_URL: 'http://localhost:3000',
    JWT_SECRET: () => generateSecret(64),
    FANOUT_BATCH_SIZE: '100',
    TRENDING_ALGORITHM: 'time-decay',
    LOG_LEVEL: 'info'
  },
  'exprsn-nexus': {
    NODE_ENV: 'development',
    PORT: '3011',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'exprsn_ca_dev',
    DB_USER: 'postgres',
    DB_PASSWORD: '',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    CA_URL: 'http://localhost:3000',
    MODERATOR_URL: 'http://localhost:3006',
    JWT_SECRET: () => generateSecret(64),
    LOG_LEVEL: 'info'
  },
  'exprsn-vault': {
    NODE_ENV: 'development',
    PORT: '3013',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'exprsn_ca_dev',
    DB_USER: 'postgres',
    DB_PASSWORD: '',
    CA_URL: 'http://localhost:3000',
    VAULT_SEAL_TYPE: 'shamir',
    VAULT_SEAL_SHARES: '5',
    VAULT_SEAL_THRESHOLD: '3',
    ENCRYPTION_KEY: () => generateSecret(32),
    LOG_LEVEL: 'info'
  },
  'exprsn-auth': {
    NODE_ENV: 'development',
    PORT: '3001',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'exprsn_ca_dev',
    DB_USER: 'postgres',
    DB_PASSWORD: '',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    CA_URL: 'http://localhost:3000',
    JWT_SECRET: () => generateSecret(64),
    SESSION_SECRET: () => generateSecret(32),
    LOG_LEVEL: 'info'
  },
  'exprsn-spark': {
    NODE_ENV: 'development',
    PORT: '3002',
    WS_PORT: '3003',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'exprsn_ca_dev',
    DB_USER: 'postgres',
    DB_PASSWORD: '',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    CA_URL: 'http://localhost:3000',
    JWT_SECRET: () => generateSecret(64),
    LOG_LEVEL: 'info'
  },
  'exprsn-prefetch': {
    NODE_ENV: 'development',
    PORT: '3005',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    CA_URL: 'http://localhost:3000',
    TIMELINE_URL: 'http://localhost:3004',
    CA_CERT_ID: '',
    HOT_CACHE_TTL: '300',
    WARM_CACHE_TTL: '1800',
    LOG_LEVEL: 'info'
  },
  'exprsn-moderator': {
    NODE_ENV: 'development',
    PORT: '3006',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'exprsn_ca_dev',
    DB_USER: 'postgres',
    DB_PASSWORD: '',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    CA_URL: 'http://localhost:3000',
    JWT_SECRET: () => generateSecret(64),
    LOG_LEVEL: 'info'
  },
  'exprsn-filevault': {
    NODE_ENV: 'development',
    PORT: '3007',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'exprsn_ca_dev',
    DB_USER: 'postgres',
    DB_PASSWORD: '',
    CA_URL: 'http://localhost:3000',
    STORAGE_TYPE: 'disk',
    STORAGE_PATH: './storage',
    MAX_FILE_SIZE: '104857600',
    LOG_LEVEL: 'info'
  },
  'exprsn-gallery': {
    NODE_ENV: 'development',
    PORT: '3008',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'exprsn_ca_dev',
    DB_USER: 'postgres',
    DB_PASSWORD: '',
    CA_URL: 'http://localhost:3000',
    FILEVAULT_URL: 'http://localhost:3007',
    LOG_LEVEL: 'info'
  },
  'exprsn-live': {
    NODE_ENV: 'development',
    PORT: '3009',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'exprsn_ca_dev',
    DB_USER: 'postgres',
    DB_PASSWORD: '',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    CA_URL: 'http://localhost:3000',
    RTMP_PORT: '1935',
    LOG_LEVEL: 'info'
  },
  'exprsn-bridge': {
    NODE_ENV: 'development',
    PORT: '3010',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    CA_URL: 'http://localhost:3000',
    RATE_LIMIT_REQUESTS: '1000',
    RATE_LIMIT_WINDOW: '900000',
    LOG_LEVEL: 'info'
  },
  'exprsn-pulse': {
    NODE_ENV: 'development',
    PORT: '3012',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'exprsn_ca_dev',
    DB_USER: 'postgres',
    DB_PASSWORD: '',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    CA_URL: 'http://localhost:3000',
    LOG_LEVEL: 'info'
  },
  'exprsn-herald': {
    NODE_ENV: 'development',
    PORT: '3014',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'exprsn_ca_dev',
    DB_USER: 'postgres',
    DB_PASSWORD: '',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    CA_URL: 'http://localhost:3000',
    SMTP_HOST: '',
    SMTP_PORT: '587',
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    LOG_LEVEL: 'info'
  }
};

/**
 * ───────────────────────────────────────────────────────────────────────
 * Schema-Driven Configuration Generation
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * Extract default values from Joi schema
 * @param {Object} schema - Joi schema
 * @returns {Object} Default configuration values
 */
function extractSchemaDefaults(schema) {
  const config = {};
  const description = schema.describe();

  if (description.keys) {
    for (const [key, keySchema] of Object.entries(description.keys)) {
      // Get default value
      if (keySchema.flags && keySchema.flags.default !== undefined) {
        const defaultValue = keySchema.flags.default;

        // Handle function defaults
        if (typeof defaultValue === 'function') {
          config[key] = defaultValue();
        } else if (typeof defaultValue === 'object' && defaultValue.$function) {
          // Handle special Joi default functions
          if (defaultValue.$function === 'now') {
            config[key] = Date.now();
          } else {
            config[key] = '';
          }
        } else {
          config[key] = defaultValue;
        }
      } else if (keySchema.type === 'object' && keySchema.keys) {
        // Recursively handle nested objects
        const nested = extractSchemaDefaults({ describe: () => keySchema });
        if (Object.keys(nested).length > 0) {
          config[key] = nested;
        }
      }
    }
  }

  return config;
}

/**
 * Get configuration template for a service
 * @param {string} serviceId - Service identifier
 * @param {string} environment - Environment (development/staging/production)
 * @returns {Object} Configuration template
 */
function getConfigTemplate(serviceId, environment = 'development') {
  // Check if we have an enterprise schema for this service
  const schema = getSchemaForService(serviceId);

  if (schema) {
    // Use schema-driven approach for services with enterprise schemas
    const schemaDefaults = extractSchemaDefaults(schema);
    const envProfile = ENVIRONMENT_PROFILES[environment] || ENVIRONMENT_PROFILES.development;

    // Merge: schema defaults + environment profile + service-specific overrides
    const config = {
      ...schemaDefaults,
      ...envProfile
    };

    // Generate dynamic values
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'function') {
        config[key] = value();
      }
    }

    return config;
  }

  // Fallback to legacy templates for services without enterprise schemas
  const template = LEGACY_CONFIG_TEMPLATES[serviceId];
  if (!template) {
    throw new Error(`No configuration template for service: ${serviceId}`);
  }

  const envProfile = ENVIRONMENT_PROFILES[environment] || {};
  const config = { ...template, ...envProfile };

  // Generate dynamic values
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'function') {
      config[key] = value();
    }
  }

  return config;
}

/**
 * Get schema information for UI generation
 * @param {string} serviceId - Service identifier
 * @returns {Object} Schema information
 */
function getSchemaInfo(serviceId) {
  const schema = getSchemaForService(serviceId);

  if (!schema) {
    return null;
  }

  const description = schema.describe();
  const fields = [];

  if (description.keys) {
    for (const [key, keySchema] of Object.entries(description.keys)) {
      const field = {
        name: key,
        type: keySchema.type,
        required: keySchema.flags?.presence === 'required',
        description: keySchema.flags?.description || '',
        default: keySchema.flags?.default,
        allow: keySchema.allow,
        valid: keySchema.valid,
        min: keySchema.rules?.find(r => r.name === 'min')?.args?.limit,
        max: keySchema.rules?.find(r => r.name === 'max')?.args?.limit
      };

      // Handle conditional requirements
      if (keySchema.whens) {
        field.conditional = keySchema.whens.map(when => ({
          ref: when.ref?.path?.[0],
          is: when.is,
          then: when.then?.flags?.presence === 'required'
        }));
      }

      fields.push(field);
    }
  }

  return {
    service: serviceId,
    hasSchema: true,
    fields,
    totalFields: fields.length,
    requiredFields: fields.filter(f => f.required).length
  };
}

/**
 * ───────────────────────────────────────────────────────────────────────
 * Validation
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * Validate configuration against schema
 * @param {string} serviceId - Service identifier
 * @param {Object} config - Configuration object
 * @returns {Object} Validation result
 */
function validateConfig(serviceId, config) {
  const schema = getSchemaForService(serviceId);

  if (!schema) {
    // No schema available, basic validation only
    logger.warn(`No validation schema for ${serviceId}, skipping validation`);
    return {
      valid: true,
      config,
      warnings: [`No validation schema available for ${serviceId}`]
    };
  }

  const { error, value, warning } = schema.validate(config, {
    allowUnknown: false,
    abortEarly: false,
    stripUnknown: true,
    convert: true
  });

  if (error) {
    return {
      valid: false,
      errors: error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
        type: d.type,
        context: d.context
      })),
      errorCount: error.details.length
    };
  }

  return {
    valid: true,
    config: value,
    warnings: warning ? warning.details.map(d => d.message) : []
  };
}

/**
 * ───────────────────────────────────────────────────────────────────────
 * File Operations
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * Convert config object to .env format
 * @param {Object} config - Configuration object
 * @param {Object} options - Formatting options
 * @returns {string} .env file content
 */
function configToEnvFormat(config, options = {}) {
  const {
    includeComments = true,
    includeDescriptions = false,
    groupBySection = true,
    serviceId = null
  } = options;

  let content = '';

  if (includeComments) {
    content += '# ═══════════════════════════════════════════════════════════════════════\n';
    content += `# Exprsn Configuration${serviceId ? ` - ${serviceId}` : ''}\n`;
    content += '# ═══════════════════════════════════════════════════════════════════════\n';
    content += `# Generated by: Exprsn Setup Service\n`;
    content += `# Generated at: ${new Date().toISOString()}\n`;
    content += `# Environment: ${config.NODE_ENV || 'development'}\n`;
    content += '# ═══════════════════════════════════════════════════════════════════════\n\n';
  }

  // Group keys by section if enabled
  const sections = groupBySection ? categorizeConfigKeys(config) : { 'All': Object.keys(config) };

  for (const [section, keys] of Object.entries(sections)) {
    if (includeComments && section !== 'All') {
      content += `# ─────────────────────────────────────────────────────────────────────\n`;
      content += `# ${section}\n`;
      content += `# ─────────────────────────────────────────────────────────────────────\n\n`;
    }

    for (const key of keys) {
      const value = config[key];

      // Add description comment if available and enabled
      if (includeDescriptions && serviceId) {
        const schemaInfo = getSchemaInfo(serviceId);
        if (schemaInfo) {
          const field = schemaInfo.fields.find(f => f.name === key);
          if (field && field.description) {
            content += `# ${field.description}\n`;
          }
        }
      }

      // Handle values with spaces or special characters
      const needsQuotes = typeof value === 'string' && (value.includes(' ') || value.includes('#'));
      const formattedValue = needsQuotes ? `"${value}"` : value;
      content += `${key}=${formattedValue}\n`;
    }

    content += '\n';
  }

  return content;
}

/**
 * Categorize configuration keys into logical sections
 * @param {Object} config - Configuration object
 * @returns {Object} Categorized keys
 */
function categorizeConfigKeys(config) {
  const sections = {
    'Application': [],
    'Database': [],
    'Redis': [],
    'Security': [],
    'CA Configuration': [],
    'Service URLs': [],
    'Storage': [],
    'Monitoring': [],
    'Other': []
  };

  for (const key of Object.keys(config)) {
    if (key.startsWith('DB_')) {
      sections['Database'].push(key);
    } else if (key.startsWith('REDIS_')) {
      sections['Redis'].push(key);
    } else if (key.startsWith('CA_')) {
      sections['CA Configuration'].push(key);
    } else if (key.includes('SECRET') || key.includes('PASSWORD') || key.includes('KEY') || key.includes('TOKEN')) {
      sections['Security'].push(key);
    } else if (key.includes('URL') || key.includes('HOST') && !key.startsWith('DB_') && !key.startsWith('REDIS_')) {
      sections['Service URLs'].push(key);
    } else if (key.startsWith('STORAGE_') || key.startsWith('S3_') || key.startsWith('VAULT_STORAGE_')) {
      sections['Storage'].push(key);
    } else if (key.startsWith('METRICS_') || key.startsWith('TRACING_') || key.startsWith('OTEL_') || key.includes('MONITORING')) {
      sections['Monitoring'].push(key);
    } else if (['NODE_ENV', 'PORT', 'LOG_LEVEL', 'LOG_FILE', 'CLUSTER_ENABLED'].includes(key)) {
      sections['Application'].push(key);
    } else {
      sections['Other'].push(key);
    }
  }

  // Remove empty sections
  return Object.fromEntries(
    Object.entries(sections).filter(([_, keys]) => keys.length > 0)
  );
}

/**
 * Parse .env file content to object
 * @param {string} content - .env file content
 * @returns {Object} Configuration object
 */
function parseEnvFile(content) {
  const config = {};
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || !line.trim()) {
      continue;
    }

    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      config[key] = value;
    }
  }

  return config;
}

/**
 * ───────────────────────────────────────────────────────────────────────
 * Configuration Management
 * ───────────────────────────────────────────────────────────────────────
 */

/**
 * Generate .env file for a service
 * @param {string} serviceId - Service identifier
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generation result
 */
async function generateConfig(serviceId, options = {}) {
  const {
    environment = 'development',
    overrides = {},
    validate = true
  } = options;

  logger.info(`Generating configuration for ${serviceId} (${environment})`);

  const template = getConfigTemplate(serviceId, environment);
  const config = { ...template, ...overrides };

  // Validate configuration if requested
  let validation = { valid: true };
  if (validate) {
    validation = validateConfig(serviceId, config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${JSON.stringify(validation.errors)}`);
    }
  }

  const envContent = configToEnvFormat(validation.config || config, {
    includeComments: true,
    includeDescriptions: false,
    groupBySection: true,
    serviceId
  });

  return {
    service: serviceId,
    environment,
    config: validation.config || config,
    envContent,
    valid: validation.valid,
    warnings: validation.warnings || [],
    schemaInfo: getSchemaInfo(serviceId)
  };
}

/**
 * Save configuration to .env file
 * @param {string} serviceId - Service identifier
 * @param {Object} config - Configuration object
 * @param {Object} options - Save options
 * @returns {Promise<Object>} Save result
 */
async function saveConfig(serviceId, config, options = {}) {
  const {
    backup = true,
    validate = true
  } = options;

  logger.info(`Saving configuration for ${serviceId}`);

  // Validate before saving
  if (validate) {
    const validation = validateConfig(serviceId, config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${JSON.stringify(validation.errors)}`);
    }
    config = validation.config;
  }

  const projectRoot = path.resolve(__dirname, '../../../..');
  const servicePath = path.join(projectRoot, 'src', serviceId);
  const envPath = path.join(servicePath, '.env');

  // Ensure service directory exists
  try {
    await fs.access(servicePath);
  } catch (error) {
    throw new Error(`Service directory not found: ${servicePath}`);
  }

  const envContent = configToEnvFormat(config, {
    includeComments: true,
    groupBySection: true,
    serviceId
  });

  // Backup existing .env if it exists and backup is enabled
  let backupPath = null;
  if (backup) {
    try {
      await fs.access(envPath);
      backupPath = `${envPath}.backup.${Date.now()}`;
      await fs.copyFile(envPath, backupPath);
      logger.info(`Backed up existing .env to ${backupPath}`);
    } catch (error) {
      // No existing .env file
    }
  }

  // Write new .env file
  await fs.writeFile(envPath, envContent, 'utf8');

  logger.info(`Configuration saved to ${envPath}`);

  return {
    success: true,
    service: serviceId,
    path: envPath,
    backupPath,
    message: 'Configuration saved successfully',
    timestamp: new Date().toISOString()
  };
}

/**
 * Load configuration from .env file
 * @param {string} serviceId - Service identifier
 * @returns {Promise<Object>} Configuration object
 */
async function loadConfig(serviceId) {
  const projectRoot = path.resolve(__dirname, '../../../..');
  const envPath = path.join(projectRoot, 'src', serviceId, '.env');

  try {
    const content = await fs.readFile(envPath, 'utf8');
    const config = parseEnvFile(content);

    // Validate loaded configuration
    const validation = validateConfig(serviceId, config);

    return {
      service: serviceId,
      config,
      exists: true,
      valid: validation.valid,
      errors: validation.errors || [],
      warnings: validation.warnings || [],
      path: envPath
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        service: serviceId,
        exists: false,
        message: 'Configuration file not found'
      };
    }
    throw error;
  }
}

/**
 * Compare two configurations
 * @param {Object} config1 - First configuration
 * @param {Object} config2 - Second configuration
 * @returns {Object} Diff result
 */
function compareConfigs(config1, config2) {
  const allKeys = new Set([...Object.keys(config1), ...Object.keys(config2)]);
  const differences = [];

  for (const key of allKeys) {
    const val1 = config1[key];
    const val2 = config2[key];

    if (val1 !== val2) {
      differences.push({
        key,
        oldValue: val1,
        newValue: val2,
        status: !val1 ? 'added' : !val2 ? 'removed' : 'changed'
      });
    }
  }

  return {
    identical: differences.length === 0,
    differences,
    changedCount: differences.filter(d => d.status === 'changed').length,
    addedCount: differences.filter(d => d.status === 'added').length,
    removedCount: differences.filter(d => d.status === 'removed').length
  };
}

/**
 * Generate configurations for all services
 * @param {Object} options - Generation options
 * @returns {Promise<Array>} Array of generation results
 */
async function generateAllConfigs(options = {}) {
  const {
    environment = 'development',
    globalOverrides = {}
  } = options;

  logger.info(`Generating configurations for all services (${environment})...`);

  const serviceIds = [
    ...Object.keys(LEGACY_CONFIG_TEMPLATES),
    'exprsn-setup'
  ];

  const results = [];

  for (const serviceId of serviceIds) {
    try {
      const result = await generateConfig(serviceId, {
        environment,
        overrides: globalOverrides
      });
      results.push(result);
    } catch (error) {
      logger.error(`Failed to generate config for ${serviceId}:`, error);
      results.push({
        service: serviceId,
        success: false,
        error: error.message
      });
    }
  }

  const successCount = results.filter(r => r.valid).length;
  logger.info(`Configuration generation complete: ${successCount}/${results.length} successful`);

  return results;
}

/**
 * Save configurations for all services
 * @param {Object} options - Save options
 * @returns {Promise<Array>} Array of save results
 */
async function saveAllConfigs(options = {}) {
  const {
    environment = 'development',
    globalOverrides = {},
    backup = true
  } = options;

  logger.info(`Saving configurations for all services (${environment})...`);

  const serviceIds = Object.keys(LEGACY_CONFIG_TEMPLATES);
  const results = [];

  for (const serviceId of serviceIds) {
    try {
      const configResult = await generateConfig(serviceId, {
        environment,
        overrides: globalOverrides
      });
      const result = await saveConfig(serviceId, configResult.config, { backup });
      results.push(result);
    } catch (error) {
      logger.error(`Failed to save config for ${serviceId}:`, error);
      results.push({
        service: serviceId,
        success: false,
        error: error.message
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  logger.info(`Configuration save complete: ${successCount}/${results.length} successful`);

  return results;
}

/**
 * List all available service configurations
 * @returns {Array} Service configuration metadata
 */
function listAllConfigs() {
  const services = Object.keys(LEGACY_CONFIG_TEMPLATES);

  return services.map(serviceId => {
    const schemaInfo = getSchemaInfo(serviceId);
    return {
      service: serviceId,
      hasEnterpriseSchema: schemaInfo !== null,
      fieldCount: schemaInfo?.totalFields || 0,
      requiredFields: schemaInfo?.requiredFields || 0,
      supportsEnvironments: true,
      environments: ['development', 'staging', 'production']
    };
  });
}

/**
 * ───────────────────────────────────────────────────────────────────────
 * Exports
 * ───────────────────────────────────────────────────────────────────────
 */

module.exports = {
  // Template functions
  getConfigTemplate,
  getSchemaInfo,

  // Validation
  validateConfig,

  // Configuration management
  generateConfig,
  saveConfig,
  loadConfig,
  compareConfigs,

  // Bulk operations
  generateAllConfigs,
  saveAllConfigs,
  listAllConfigs,

  // Utilities
  configToEnvFormat,
  parseEnvFile,
  generateSecret,
  generateUUID,

  // Legacy support
  CONFIG_TEMPLATES: LEGACY_CONFIG_TEMPLATES
};
