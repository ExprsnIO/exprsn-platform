/**
 * ═══════════════════════════════════════════════════════════════════════
 * Storage Management Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const storage = require('../storage');
const logger = require('../utils/logger');
const { File, FileBlob, StorageQuota } = require('../models');
const { Op } = require('sequelize');

class StorageService {
  /**
   * Select best storage backend for upload
   */
  selectBackend(preferences = {}) {
    return storage.selectBackend(preferences);
  }

  /**
   * Migrate file between storage backends
   */
  async migrateFile(fileId, toBackend, options = {}) {
    try {
      logger.info('Migrating file', { fileId, toBackend });

      // Get file from database
      const file = await File.findByPk(fileId, {
        include: ['blob']
      });

      if (!file) {
        throw new Error('File not found');
      }

      const fromBackend = file.blob.storage_backend;

      if (fromBackend === toBackend) {
        throw new Error('File is already on the target backend');
      }

      // Perform migration
      const result = await storage.migrate(
        file.blob.storage_key,
        fromBackend,
        toBackend,
        {
          originalname: file.name,
          newKey: options.newKey,
          metadata: options.metadata,
          deleteSource: options.deleteSource !== false
        }
      );

      // Update database
      file.blob.storage_backend = toBackend;
      file.blob.storage_key = result.destinationKey;
      await file.blob.save();

      logger.info('File migration completed', {
        fileId,
        fromBackend,
        toBackend
      });

      return {
        success: true,
        file,
        migration: result
      };
    } catch (error) {
      logger.error('File migration failed', {
        error: error.message,
        fileId,
        toBackend
      });
      throw error;
    }
  }

  /**
   * Migrate multiple files
   */
  async migrateFiles(fileIds, toBackend, options = {}) {
    const results = {
      success: [],
      failed: []
    };

    for (const fileId of fileIds) {
      try {
        await this.migrateFile(fileId, toBackend, options);
        results.success.push(fileId);
      } catch (error) {
        results.failed.push({
          fileId,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    try {
      // Get backend statistics
      const backendStats = await storage.getStats();

      // Get database statistics
      const totalFiles = await File.count();
      const totalBlobs = await FileBlob.count();
      const totalSize = await FileBlob.sum('size') || 0;

      // Get per-backend usage
      const backendUsage = await FileBlob.findAll({
        attributes: [
          'storage_backend',
          [FileBlob.sequelize.fn('COUNT', FileBlob.sequelize.col('id')), 'file_count'],
          [FileBlob.sequelize.fn('SUM', FileBlob.sequelize.col('size')), 'total_size']
        ],
        group: ['storage_backend']
      });

      return {
        totalFiles,
        totalBlobs,
        totalSize,
        totalSizeFormatted: this.formatBytes(totalSize),
        backends: backendStats,
        usage: backendUsage.map(item => ({
          backend: item.storage_backend,
          fileCount: parseInt(item.dataValues.file_count),
          totalSize: parseInt(item.dataValues.total_size) || 0,
          totalSizeFormatted: this.formatBytes(parseInt(item.dataValues.total_size) || 0)
        }))
      };
    } catch (error) {
      logger.error('Failed to get storage stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate storage quota for user
   */
  async calculateStorageQuota(userId) {
    try {
      // Get user's current quota
      let quota = await StorageQuota.findOne({ where: { user_id: userId } });

      if (!quota) {
        // Create default quota
        const defaultQuota = 10 * 1024 * 1024 * 1024; // 10GB
        quota = await StorageQuota.create({
          user_id: userId,
          quota_bytes: defaultQuota,
          used_bytes: 0
        });
      }

      // Calculate actual usage
      const files = await File.findAll({
        where: { user_id: userId },
        include: ['blob']
      });

      const usedBytes = files.reduce((total, file) => {
        return total + (file.blob?.size || 0);
      }, 0);

      // Update quota
      quota.used_bytes = usedBytes;
      await quota.save();

      return {
        userId,
        usedBytes,
        quotaBytes: quota.quota_bytes,
        availableBytes: quota.quota_bytes - usedBytes,
        usedPercentage: (usedBytes / quota.quota_bytes) * 100,
        usedFormatted: this.formatBytes(usedBytes),
        quotaFormatted: this.formatBytes(quota.quota_bytes),
        availableFormatted: this.formatBytes(quota.quota_bytes - usedBytes)
      };
    } catch (error) {
      logger.error('Failed to calculate storage quota', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Update user storage quota
   */
  async updateUserQuota(userId, quotaBytes) {
    try {
      let quota = await StorageQuota.findOne({ where: { user_id: userId } });

      if (!quota) {
        quota = await StorageQuota.create({
          user_id: userId,
          quota_bytes: quotaBytes,
          used_bytes: 0
        });
      } else {
        quota.quota_bytes = quotaBytes;
        await quota.save();
      }

      return await this.calculateStorageQuota(userId);
    } catch (error) {
      logger.error('Failed to update user quota', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Check if user has enough quota
   */
  async checkQuota(userId, requiredBytes) {
    const quota = await this.calculateStorageQuota(userId);

    if (quota.usedBytes + requiredBytes > quota.quotaBytes) {
      return {
        allowed: false,
        reason: 'Quota exceeded',
        quota
      };
    }

    return {
      allowed: true,
      quota
    };
  }

  /**
   * Cleanup orphaned files (blobs not referenced by any file)
   */
  async cleanupOrphanedFiles(options = {}) {
    try {
      logger.info('Starting orphaned file cleanup');

      // Find blobs with ref_count = 0
      const orphanedBlobs = await FileBlob.findAll({
        where: {
          ref_count: 0,
          created_at: {
            [Op.lt]: new Date(Date.now() - (options.minAge || 86400000)) // 24h default
          }
        }
      });

      logger.info(`Found ${orphanedBlobs.length} orphaned blobs`);

      const results = {
        deleted: [],
        failed: []
      };

      for (const blob of orphanedBlobs) {
        try {
          // Delete from storage backend
          await storage.delete(blob.storage_key, blob.storage_backend);

          // Delete from database
          await blob.destroy();

          results.deleted.push(blob.id);

          logger.info('Orphaned blob deleted', {
            blobId: blob.id,
            backend: blob.storage_backend,
            key: blob.storage_key
          });
        } catch (error) {
          logger.error('Failed to delete orphaned blob', {
            error: error.message,
            blobId: blob.id
          });
          results.failed.push({
            blobId: blob.id,
            error: error.message
          });
        }
      }

      logger.info('Orphaned file cleanup completed', {
        deleted: results.deleted.length,
        failed: results.failed.length
      });

      return results;
    } catch (error) {
      logger.error('Orphaned file cleanup failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Cleanup old file versions
   */
  async cleanupOldVersions(fileId, keepCount = 10) {
    try {
      const file = await File.findByPk(fileId, {
        include: ['versions']
      });

      if (!file) {
        throw new Error('File not found');
      }

      const versions = file.versions
        .sort((a, b) => b.version_number - a.version_number)
        .slice(keepCount);

      if (versions.length === 0) {
        return { deletedCount: 0 };
      }

      const results = {
        deleted: [],
        failed: []
      };

      for (const version of versions) {
        try {
          // Decrement blob reference count
          const blob = await FileBlob.findByPk(version.blob_id);
          if (blob) {
            blob.ref_count = Math.max(0, blob.ref_count - 1);
            await blob.save();
          }

          // Delete version
          await version.destroy();
          results.deleted.push(version.id);
        } catch (error) {
          results.failed.push({
            versionId: version.id,
            error: error.message
          });
        }
      }

      return {
        deletedCount: results.deleted.length,
        failedCount: results.failed.length,
        results
      };
    } catch (error) {
      logger.error('Failed to cleanup old versions', {
        error: error.message,
        fileId
      });
      throw error;
    }
  }

  /**
   * Get storage health status
   */
  async getHealthStatus() {
    return await storage.healthCheck();
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = new StorageService();
