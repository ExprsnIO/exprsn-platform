/**
 * ═══════════════════════════════════════════════════════════════════════
 * Configuration Manager
 * Manages .env files for Exprsn microservices
 * ═══════════════════════════════════════════════════════════════════════
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class ConfigManager {
  constructor() {
    this.servicesBasePath = path.join(__dirname, '../../../');
    this.serviceConfigs = {
      ca: { dir: 'exprsn-ca', envFile: '.env' },
      auth: { dir: 'exprsn-auth', envFile: '.env' },
      spark: { dir: 'exprsn-spark', envFile: '.env' },
      timeline: { dir: 'exprsn-timeline', envFile: '.env' },
      prefetch: { dir: 'exprsn-prefetch', envFile: '.env' },
      moderator: { dir: 'exprsn-moderator', envFile: '.env' },
      filevault: { dir: 'exprsn-filevault', envFile: '.env' },
      gallery: { dir: 'exprsn-gallery', envFile: '.env' },
      live: { dir: 'exprsn-live', envFile: '.env' },
      bridge: { dir: 'exprsn-bridge', envFile: '.env' },
      nexus: { dir: 'exprsn-nexus', envFile: '.env' },
      pulse: { dir: 'exprsn-pulse', envFile: '.env' },
      vault: { dir: 'exprsn-vault', envFile: '.env' },
      herald: { dir: 'exprsn-herald', envFile: '.env' },
      setup: { dir: 'exprsn-setup', envFile: '.env' },
      forge: { dir: 'exprsn-forge', envFile: '.env' },
      workflow: { dir: 'exprsn-workflow', envFile: '.env' },
      svr: { dir: 'exprsn-svr', envFile: '.env' }
    };
  }

  /**
   * Get path to service's .env file
   */
  getEnvPath(serviceId) {
    const config = this.serviceConfigs[serviceId];
    if (!config) {
      throw new Error(`Unknown service: ${serviceId}`);
    }
    return path.join(this.servicesBasePath, config.dir, config.envFile);
  }

  /**
   * Parse .env file content into key-value object
   */
  parseEnvContent(content) {
    const config = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse KEY=VALUE
      const match = trimmed.match(/^([^=]+)=(.*)$/);
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
   * Convert key-value object to .env file content
   */
  stringifyEnvContent(config, comments = {}) {
    let content = '';

    for (const [key, value] of Object.entries(config)) {
      // Add comment if provided
      if (comments[key]) {
        content += `# ${comments[key]}\n`;
      }

      // Quote value if it contains spaces or special characters
      let formattedValue = value;
      if (typeof value === 'string' && (value.includes(' ') || value.includes('#'))) {
        formattedValue = `"${value}"`;
      }

      content += `${key}=${formattedValue}\n`;
    }

    return content;
  }

  /**
   * Read configuration from service's .env file
   */
  async readConfig(serviceId) {
    try {
      const envPath = this.getEnvPath(serviceId);

      // Check if file exists
      try {
        await fs.access(envPath);
      } catch (err) {
        logger.warn(`No .env file found for ${serviceId}, returning empty config`);
        return {};
      }

      const content = await fs.readFile(envPath, 'utf8');
      const config = this.parseEnvContent(content);

      logger.info(`Read configuration for ${serviceId}`, {
        keysCount: Object.keys(config).length
      });

      return config;
    } catch (error) {
      logger.error(`Failed to read config for ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * Write configuration to service's .env file
   */
  async writeConfig(serviceId, config, options = {}) {
    try {
      const envPath = this.getEnvPath(serviceId);
      const { backup = true, comments = {} } = options;

      // Create backup if requested
      if (backup) {
        await this.backupConfig(serviceId);
      }

      // Convert config to .env format
      const content = this.stringifyEnvContent(config, comments);

      // Write to file
      await fs.writeFile(envPath, content, 'utf8');

      logger.info(`Wrote configuration for ${serviceId}`, {
        keysCount: Object.keys(config).length,
        backup
      });

      return {
        success: true,
        path: envPath,
        keysWritten: Object.keys(config).length
      };
    } catch (error) {
      logger.error(`Failed to write config for ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * Update specific keys in service's .env file
   */
  async updateConfig(serviceId, updates, options = {}) {
    try {
      // Read existing config
      const currentConfig = await this.readConfig(serviceId);

      // Merge updates
      const newConfig = { ...currentConfig, ...updates };

      // Write updated config
      const result = await this.writeConfig(serviceId, newConfig, options);

      logger.info(`Updated configuration for ${serviceId}`, {
        keysUpdated: Object.keys(updates).length
      });

      return result;
    } catch (error) {
      logger.error(`Failed to update config for ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * Backup service's .env file
   */
  async backupConfig(serviceId) {
    try {
      const envPath = this.getEnvPath(serviceId);

      // Check if original exists
      try {
        await fs.access(envPath);
      } catch (err) {
        logger.warn(`No .env file to backup for ${serviceId}`);
        return null;
      }

      // Create backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${envPath}.backup.${timestamp}`;

      // Copy file
      await fs.copyFile(envPath, backupPath);

      logger.info(`Created backup for ${serviceId}`, { backupPath });

      return backupPath;
    } catch (error) {
      logger.error(`Failed to backup config for ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * Restore service's .env file from backup
   */
  async restoreConfig(serviceId, backupPath) {
    try {
      const envPath = this.getEnvPath(serviceId);

      // Verify backup exists
      await fs.access(backupPath);

      // Copy backup to .env
      await fs.copyFile(backupPath, envPath);

      logger.info(`Restored configuration for ${serviceId}`, { backupPath });

      return {
        success: true,
        path: envPath,
        restoredFrom: backupPath
      };
    } catch (error) {
      logger.error(`Failed to restore config for ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * List all backups for a service
   */
  async listBackups(serviceId) {
    try {
      const envPath = this.getEnvPath(serviceId);
      const dir = path.dirname(envPath);
      const envFile = path.basename(envPath);

      // Read directory
      const files = await fs.readdir(dir);

      // Filter backup files
      const backups = files
        .filter(file => file.startsWith(`${envFile}.backup.`))
        .map(file => ({
          filename: file,
          path: path.join(dir, file),
          timestamp: file.replace(`${envFile}.backup.`, '').replace('.env', '')
        }))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return backups;
    } catch (error) {
      logger.error(`Failed to list backups for ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a specific backup
   */
  async deleteBackup(serviceId, backupPath) {
    try {
      await fs.unlink(backupPath);
      logger.info(`Deleted backup for ${serviceId}`, { backupPath });
      return { success: true };
    } catch (error) {
      logger.error(`Failed to delete backup for ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * Get configuration template for a service
   */
  getConfigTemplate(serviceId) {
    const templates = {
      ca: {
        PORT: '3000',
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'exprsn_ca',
        DB_USER: 'postgres',
        DB_PASSWORD: '',
        REDIS_ENABLED: 'true',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        TLS_ENABLED: 'false',
        TLS_CERT_PATH: '',
        TLS_KEY_PATH: '',
        OCSP_ENABLED: 'true',
        OCSP_PORT: '2560',
        CRL_ENABLED: 'true',
        JWT_SECRET: '',
        LOG_LEVEL: 'info'
      },
      auth: {
        PORT: '3001',
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'exprsn_auth',
        DB_USER: 'postgres',
        DB_PASSWORD: '',
        REDIS_ENABLED: 'true',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        TLS_ENABLED: 'false',
        JWT_SECRET: '',
        JWT_EXPIRY: '3600',
        OAUTH2_ENABLED: 'false',
        SAML_ENABLED: 'false',
        MFA_ENABLED: 'false',
        LOG_LEVEL: 'info'
      },
      spark: {
        PORT: '3002',
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'exprsn_spark',
        DB_USER: 'postgres',
        DB_PASSWORD: '',
        REDIS_ENABLED: 'true',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        E2EE_ENABLED: 'true',
        MESSAGE_RETENTION_DAYS: '90',
        MAX_MESSAGE_SIZE: '10485760',
        LOG_LEVEL: 'info'
      },
      timeline: {
        PORT: '3004',
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'exprsn_timeline',
        DB_USER: 'postgres',
        DB_PASSWORD: '',
        REDIS_ENABLED: 'true',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        BULL_ENABLED: 'true',
        FANOUT_ENABLED: 'true',
        CACHE_TTL: '300',
        LOG_LEVEL: 'info'
      },
      nexus: {
        PORT: '3011',
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'exprsn_nexus',
        DB_USER: 'postgres',
        DB_PASSWORD: '',
        REDIS_ENABLED: 'true',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        CALDAV_ENABLED: 'true',
        CARDDAV_ENABLED: 'true',
        MAX_GROUP_SIZE: '10000',
        LOG_LEVEL: 'info'
      },
      workflow: {
        PORT: '3017',
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'exprsn_workflow',
        DB_USER: 'postgres',
        DB_PASSWORD: '',
        REDIS_ENABLED: 'true',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        MAX_EXECUTION_TIME: '300000',
        SANDBOX_ENABLED: 'true',
        LOG_LEVEL: 'info'
      },
      moderator: {
        PORT: '3006',
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'exprsn_moderator',
        DB_USER: 'postgres',
        DB_PASSWORD: '',
        REDIS_ENABLED: 'true',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        AI_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: '',
        OPENAI_API_KEY: '',
        LOG_LEVEL: 'info'
      },
      filevault: {
        PORT: '3007',
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'exprsn_filevault',
        DB_USER: 'postgres',
        DB_PASSWORD: '',
        REDIS_ENABLED: 'true',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        STORAGE_BACKEND: 'disk',
        STORAGE_PATH: './storage',
        S3_ENABLED: 'false',
        IPFS_ENABLED: 'false',
        LOG_LEVEL: 'info'
      },
      live: {
        PORT: '3009',
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'exprsn_live',
        DB_USER: 'postgres',
        DB_PASSWORD: '',
        CLOUDFLARE_ENABLED: 'false',
        CLOUDFLARE_ACCOUNT_ID: '',
        CLOUDFLARE_API_TOKEN: '',
        LOG_LEVEL: 'info'
      }
    };

    return templates[serviceId] || {};
  }

  /**
   * Validate configuration against schema
   */
  validateConfig(serviceId, config) {
    const errors = [];
    const warnings = [];

    // Basic validation rules
    const requiredKeys = ['PORT', 'NODE_ENV', 'DB_HOST', 'DB_PORT', 'DB_NAME'];

    for (const key of requiredKeys) {
      if (!config[key]) {
        errors.push(`Missing required key: ${key}`);
      }
    }

    // Port validation
    if (config.PORT && (isNaN(config.PORT) || config.PORT < 1 || config.PORT > 65535)) {
      errors.push('PORT must be a number between 1 and 65535');
    }

    // Database port validation
    if (config.DB_PORT && (isNaN(config.DB_PORT) || config.DB_PORT < 1 || config.DB_PORT > 65535)) {
      errors.push('DB_PORT must be a number between 1 and 65535');
    }

    // Redis port validation
    if (config.REDIS_PORT && (isNaN(config.REDIS_PORT) || config.REDIS_PORT < 1 || config.REDIS_PORT > 65535)) {
      errors.push('REDIS_PORT must be a number between 1 and 65535');
    }

    // TLS validation
    if (config.TLS_ENABLED === 'true') {
      if (!config.TLS_CERT_PATH) {
        warnings.push('TLS_ENABLED is true but TLS_CERT_PATH is not set');
      }
      if (!config.TLS_KEY_PATH) {
        warnings.push('TLS_ENABLED is true but TLS_KEY_PATH is not set');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Singleton instance
const configManager = new ConfigManager();

module.exports = configManager;
