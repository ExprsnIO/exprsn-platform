/**
 * ═══════════════════════════════════════════════════════════════════════
 * Local Disk Storage Backend
 * ═══════════════════════════════════════════════════════════════════════
 */

const fs = require('fs').promises;
const fscb = require('fs');
const { pipeline } = require('stream/promises');
const path = require('path');
const crypto = require('crypto');
const logger = require('../../utils/logger');

class DiskBackend {
  constructor(config) {
    this.config = config;
    this.initialized = false;
  }

  /**
   * Initialize disk storage
   */
  async initialize() {
    try {
      // Create storage directory if it doesn't exist
      await fs.mkdir(this.config.storagePath, { recursive: true });

      // Test write access
      const testFile = path.join(this.config.storagePath, '.test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);

      this.initialized = true;
      logger.info('Disk backend initialized', {
        path: this.config.storagePath
      });

      return true;
    } catch (error) {
      logger.error('Failed to initialize Disk backend', { error: error.message });
      throw error;
    }
  }

  /**
   * Store file on disk
   */
  async store(file, options = {}) {
    if (!this.initialized) {
      throw new Error('Disk backend not initialized');
    }

    try {
      const key = options.key || this.generateKey(file.originalname);
      const filePath = this.getFilePath(key);

      // Create directory structure
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      // Write file
      await fs.writeFile(filePath, file.buffer);

      // Store metadata if provided
      if (options.metadata) {
        const metadataPath = `${filePath}.meta`;
        await fs.writeFile(metadataPath, JSON.stringify(options.metadata));
      }

      logger.info('File stored on disk', { key, path: filePath });

      return {
        key,
        backend: 'disk',
        path: filePath
      };
    } catch (error) {
      logger.error('Failed to store file on disk', { error: error.message });
      throw error;
    }
  }

  /**
   * Retrieve file from disk
   */
  async retrieve(key) {
    if (!this.initialized) {
      throw new Error('Disk backend not initialized');
    }

    try {
      const filePath = this.getFilePath(key);
      const data = await fs.readFile(filePath);

      logger.info('File retrieved from disk', { key });

      return data;
    } catch (error) {
      logger.error('Failed to retrieve file from disk', {
        error: error.message,
        key
      });
      throw error;
    }
  }

  /**
   * Stream a stored file to a local destination path WITHOUT buffering the
   * whole object in memory (OOM guard for large media, e.g. video moderation).
   *
   * The caller owns creating the parent directory of `destPath`. We resolve the
   * source path from `key` and defensively confirm it stays inside the storage
   * root so an attacker-controlled key can't traverse out of it.
   *
   * @param {string} key      storage key (from a trusted File row)
   * @param {string} destPath absolute/relative local path to stream into
   * @returns {Promise<{path: string, bytesWritten: number}>}
   */
  async retrieveToFile(key, destPath) {
    if (!this.initialized) {
      throw new Error('Disk backend not initialized');
    }

    if (!destPath || typeof destPath !== 'string') {
      throw new Error('retrieveToFile requires a destination path');
    }

    const root = path.resolve(this.config.storagePath);
    const source = path.resolve(this.getFilePath(key));

    // Defensive: reject keys that resolve outside the storage root.
    if (source !== root && !source.startsWith(root + path.sep)) {
      throw new Error('Invalid storage key: resolved path escapes storage root');
    }

    const dest = path.resolve(destPath);

    try {
      await pipeline(
        fscb.createReadStream(source),
        fscb.createWriteStream(dest)
      );

      const { size } = await fs.stat(dest);

      logger.info('File streamed from disk', { key, dest, bytesWritten: size });

      return { path: dest, bytesWritten: size };
    } catch (error) {
      logger.error('Failed to stream file from disk', {
        error: error.message,
        key
      });
      throw error;
    }
  }

  /**
   * Delete file from disk
   */
  async delete(key) {
    if (!this.initialized) {
      throw new Error('Disk backend not initialized');
    }

    try {
      const filePath = this.getFilePath(key);

      // Delete file
      await fs.unlink(filePath);

      // Delete metadata if exists
      const metadataPath = `${filePath}.meta`;
      try {
        await fs.unlink(metadataPath);
      } catch (metaError) {
        // Metadata file might not exist, ignore error
      }

      logger.info('File deleted from disk', { key });

      return { success: true, key };
    } catch (error) {
      logger.error('Failed to delete file from disk', {
        error: error.message,
        key
      });
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    if (!this.initialized) {
      throw new Error('Disk backend not initialized');
    }

    try {
      const stats = await this.getDirectoryStats(this.config.storagePath);

      return {
        backend: 'disk',
        path: this.config.storagePath,
        fileCount: stats.fileCount,
        totalSize: stats.totalSize,
        maxSize: this.config.maxSize,
        maxFileSize: this.config.maxFileSize,
        availableSpace: this.config.maxSize - stats.totalSize,
        healthy: true
      };
    } catch (error) {
      logger.error('Failed to get Disk stats', { error: error.message });
      return {
        backend: 'disk',
        error: error.message,
        healthy: false
      };
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Check if storage path exists and is writable
      await fs.access(this.config.storagePath, fs.constants.W_OK);

      // Test write
      const testFile = path.join(this.config.storagePath, '.health');
      await fs.writeFile(testFile, 'health-check');
      await fs.unlink(testFile);

      return {
        healthy: true,
        backend: 'disk',
        path: this.config.storagePath
      };
    } catch (error) {
      logger.error('Disk health check failed', { error: error.message });

      return {
        healthy: false,
        backend: 'disk',
        error: error.message
      };
    }
  }

  /**
   * Get file path from key
   */
  getFilePath(key) {
    // Use first 2 chars of key for directory sharding
    const shard = key.substring(0, 2);
    return path.join(this.config.storagePath, shard, key);
  }

  /**
   * Generate unique key for file
   */
  generateKey(filename) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const ext = filename.split('.').pop();

    return `${timestamp}-${random}.${ext}`;
  }

  /**
   * Get directory statistics recursively
   */
  async getDirectoryStats(dirPath) {
    let fileCount = 0;
    let totalSize = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const subStats = await this.getDirectoryStats(fullPath);
          fileCount += subStats.fileCount;
          totalSize += subStats.totalSize;
        } else if (entry.isFile() && !entry.name.endsWith('.meta')) {
          const stats = await fs.stat(fullPath);
          fileCount++;
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // Directory might not exist or be inaccessible
      logger.warn('Failed to read directory stats', {
        error: error.message,
        dirPath
      });
    }

    return { fileCount, totalSize };
  }
}

module.exports = DiskBackend;
