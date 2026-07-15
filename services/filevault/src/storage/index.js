/**
 * ═══════════════════════════════════════════════════════════════════════
 * Storage Backend Manager
 * ═══════════════════════════════════════════════════════════════════════
 */

const storageConfig = require('../config/storage');
const logger = require('../utils/logger');

// Storage backend implementations
const S3Backend = require('./backends/s3');
const DiskBackend = require('./backends/disk');
const IPFSBackend = require('./backends/ipfs');

class StorageManager {
  constructor() {
    this.backends = new Map();
    this.initialized = false;
  }

  /**
   * Initialize all enabled storage backends
   */
  async initializeStorage() {
    try {
      logger.info('Initializing storage backends...');

      // Initialize S3 backend
      if (storageConfig.s3.enabled) {
        try {
          const s3Backend = new S3Backend(storageConfig.s3);
          await s3Backend.initialize();
          this.backends.set('s3', s3Backend);
          logger.info('S3 backend initialized');
        } catch (error) {
          logger.warn('Failed to initialize S3 backend', { error: error.message });
        }
      }

      // Initialize Disk backend
      if (storageConfig.disk.enabled) {
        try {
          const diskBackend = new DiskBackend(storageConfig.disk);
          await diskBackend.initialize();
          this.backends.set('disk', diskBackend);
          logger.info('Disk backend initialized');
        } catch (error) {
          logger.warn('Failed to initialize Disk backend', { error: error.message });
        }
      }

      // Initialize IPFS backend
      if (storageConfig.ipfs.enabled) {
        try {
          const ipfsBackend = new IPFSBackend(storageConfig.ipfs);
          await ipfsBackend.initialize();
          this.backends.set('ipfs', ipfsBackend);
          logger.info('IPFS backend initialized');
        } catch (error) {
          logger.warn('Failed to initialize IPFS backend', { error: error.message });
        }
      }

      if (this.backends.size === 0) {
        throw new Error('No storage backends initialized');
      }

      this.initialized = true;
      logger.info(`Storage manager initialized with ${this.backends.size} backend(s)`);

      return true;
    } catch (error) {
      logger.error('Failed to initialize storage manager', { error: error.message });
      throw error;
    }
  }

  /**
   * Select best storage backend based on preferences
   */
  selectBackend(preferences = {}) {
    if (!this.initialized) {
      throw new Error('Storage manager not initialized');
    }

    const { backend, fileSize, permanent } = preferences;

    // If backend is specified and available, use it
    if (backend && this.backends.has(backend)) {
      return backend;
    }

    // If file should be permanent and IPFS is available, use IPFS
    if (permanent && this.backends.has('ipfs')) {
      return 'ipfs';
    }

    // Use default backend if available
    if (this.backends.has(storageConfig.defaultBackend)) {
      return storageConfig.defaultBackend;
    }

    // Fall back to first available backend
    return Array.from(this.backends.keys())[0];
  }

  /**
   * Get storage backend instance
   */
  getBackend(name) {
    if (!this.initialized) {
      throw new Error('Storage manager not initialized');
    }

    const backend = this.backends.get(name);
    if (!backend) {
      throw new Error(`Backend '${name}' not available`);
    }

    return backend;
  }

  /**
   * Store file in specified backend
   */
  async store(file, backend, options = {}) {
    const backendInstance = this.getBackend(backend);
    return await backendInstance.store(file, options);
  }

  /**
   * Retrieve file from specified backend
   */
  async retrieve(key, backend) {
    const backendInstance = this.getBackend(backend);
    return await backendInstance.retrieve(key);
  }

  /**
   * Stream a stored file to a local destination path, without ever holding the
   * whole object in memory. Prefer this over retrieve() for large media (video
   * moderation, etc.) to avoid OOM on constrained hosts.
   *
   * @param {string} key      storage key (from a trusted File row)
   * @param {string} backend  backend name (disk|s3|ipfs)
   * @param {string} destPath local path to stream into (caller owns its parent dir)
   * @returns {Promise<{path: string, bytesWritten: number}>}
   */
  async retrieveToFile(key, backend, destPath) {
    const backendInstance = this.getBackend(backend);

    if (typeof backendInstance.retrieveToFile !== 'function') {
      throw new Error(`Backend '${backend}' does not support streaming retrieval`);
    }

    return await backendInstance.retrieveToFile(key, destPath);
  }

  /**
   * Delete file from specified backend
   */
  async delete(key, backend) {
    const backendInstance = this.getBackend(backend);
    return await backendInstance.delete(key);
  }

  /**
   * Migrate file between backends
   */
  async migrate(sourceKey, fromBackend, toBackend, options = {}) {
    try {
      logger.info('Migrating file', { sourceKey, fromBackend, toBackend });

      // Retrieve from source backend
      const fileData = await this.retrieve(sourceKey, fromBackend);

      // Store in destination backend
      const destinationKey = options.newKey || sourceKey;
      await this.store({
        buffer: fileData,
        originalname: options.originalname || sourceKey,
        ...options.metadata
      }, toBackend, { key: destinationKey });

      // Delete from source backend if requested
      if (options.deleteSource) {
        await this.delete(sourceKey, fromBackend);
      }

      logger.info('File migration completed', {
        sourceKey,
        destinationKey,
        fromBackend,
        toBackend
      });

      return {
        success: true,
        sourceKey,
        destinationKey,
        fromBackend,
        toBackend
      };
    } catch (error) {
      logger.error('File migration failed', {
        error: error.message,
        sourceKey,
        fromBackend,
        toBackend
      });
      throw error;
    }
  }

  /**
   * Get statistics for all backends
   */
  async getStats() {
    const stats = {};

    for (const [name, backend] of this.backends) {
      try {
        stats[name] = await backend.getStats();
      } catch (error) {
        logger.error(`Failed to get stats for ${name}`, { error: error.message });
        stats[name] = { error: error.message };
      }
    }

    return stats;
  }

  /**
   * Health check for all backends
   */
  async healthCheck() {
    const health = {
      healthy: true,
      backends: {}
    };

    for (const [name, backend] of this.backends) {
      try {
        const backendHealth = await backend.healthCheck();
        health.backends[name] = backendHealth;

        if (!backendHealth.healthy) {
          health.healthy = false;
        }
      } catch (error) {
        logger.error(`Health check failed for ${name}`, { error: error.message });
        health.backends[name] = {
          healthy: false,
          error: error.message
        };
        health.healthy = false;
      }
    }

    return health;
  }

  /**
   * Get list of available backends
   */
  getAvailableBackends() {
    return Array.from(this.backends.keys());
  }
}

// Export singleton instance
const storageManager = new StorageManager();
module.exports = storageManager;
