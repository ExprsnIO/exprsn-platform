/**
 * ═══════════════════════════════════════════════════════════════════════
 * File Deduplication Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');
const { FileBlob } = require('../models');
const { calculateSHA256 } = require('../utils/checksum');

class DeduplicationService {
  /**
   * Find duplicate files by checksum
   */
  async findDuplicates(checksum) {
    try {
      const blobs = await FileBlob.findAll({
        where: { checksum }
      });

      logger.info('Duplicate search completed', {
        checksum,
        count: blobs.length
      });

      return blobs;
    } catch (error) {
      logger.error('Failed to find duplicates', {
        error: error.message,
        checksum
      });
      throw error;
    }
  }

  /**
   * Deduplicate file on upload
   */
  async deduplicateFile(checksum, uploadResult, metadata = {}) {
    try {
      logger.info('Checking for duplicate files', { checksum });

      // Check if blob with same checksum exists
      const existingBlob = await FileBlob.findOne({
        where: { checksum }
      });

      if (existingBlob) {
        // File already exists, increment reference count
        existingBlob.ref_count += 1;
        await existingBlob.save();

        logger.info('Duplicate file found, reusing existing blob', {
          checksum,
          blobId: existingBlob.id,
          refCount: existingBlob.ref_count
        });

        return {
          deduplicated: true,
          blob: existingBlob,
          savedBytes: uploadResult.size
        };
      }

      // Create new blob
      const blob = await FileBlob.create({
        checksum,
        size: uploadResult.size,
        storage_backend: uploadResult.backend,
        storage_key: uploadResult.key,
        ref_count: 1,
        metadata: metadata
      });

      logger.info('New file blob created', {
        checksum,
        blobId: blob.id
      });

      return {
        deduplicated: false,
        blob,
        savedBytes: 0
      };
    } catch (error) {
      logger.error('Deduplication failed', {
        error: error.message,
        checksum
      });
      throw error;
    }
  }

  /**
   * Increment blob reference count
   */
  async incrementRefCount(blobId) {
    try {
      const blob = await FileBlob.findByPk(blobId);

      if (!blob) {
        throw new Error('Blob not found');
      }

      blob.ref_count += 1;
      await blob.save();

      logger.info('Blob reference count incremented', {
        blobId,
        refCount: blob.ref_count
      });

      return blob;
    } catch (error) {
      logger.error('Failed to increment ref count', {
        error: error.message,
        blobId
      });
      throw error;
    }
  }

  /**
   * Decrement blob reference count
   */
  async decrementRefCount(blobId) {
    try {
      const blob = await FileBlob.findByPk(blobId);

      if (!blob) {
        throw new Error('Blob not found');
      }

      blob.ref_count = Math.max(0, blob.ref_count - 1);
      await blob.save();

      logger.info('Blob reference count decremented', {
        blobId,
        refCount: blob.ref_count
      });

      return blob;
    } catch (error) {
      logger.error('Failed to decrement ref count', {
        error: error.message,
        blobId
      });
      throw error;
    }
  }

  /**
   * Get blob reference count
   */
  async getRefCount(blobId) {
    try {
      const blob = await FileBlob.findByPk(blobId);

      if (!blob) {
        throw new Error('Blob not found');
      }

      return blob.ref_count;
    } catch (error) {
      logger.error('Failed to get ref count', {
        error: error.message,
        blobId
      });
      throw error;
    }
  }

  /**
   * Find all blobs with no references
   */
  async findUnreferencedBlobs() {
    try {
      const blobs = await FileBlob.findAll({
        where: { ref_count: 0 }
      });

      logger.info('Unreferenced blobs found', { count: blobs.length });

      return blobs;
    } catch (error) {
      logger.error('Failed to find unreferenced blobs', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Cleanup unreferenced blobs
   */
  async cleanupUnreferencedBlobs(options = {}) {
    try {
      const storage = require('../storage');

      logger.info('Starting cleanup of unreferenced blobs');

      const blobs = await this.findUnreferencedBlobs();

      if (blobs.length === 0) {
        logger.info('No unreferenced blobs to clean up');
        return {
          deletedCount: 0,
          savedBytes: 0
        };
      }

      let deletedCount = 0;
      let savedBytes = 0;
      const errors = [];

      for (const blob of blobs) {
        try {
          // Only delete if blob has been unreferenced for a while (safety)
          const minAge = options.minAge || 86400000; // 24 hours
          const age = Date.now() - new Date(blob.updated_at).getTime();

          if (age < minAge) {
            logger.info('Skipping recently unreferenced blob', {
              blobId: blob.id,
              age: Math.round(age / 1000 / 60) + ' minutes'
            });
            continue;
          }

          // Delete from storage backend
          await storage.delete(blob.storage_key, blob.storage_backend);

          // Delete from database
          await blob.destroy();

          deletedCount++;
          savedBytes += blob.size;

          logger.info('Unreferenced blob deleted', {
            blobId: blob.id,
            size: blob.size
          });
        } catch (error) {
          logger.error('Failed to delete unreferenced blob', {
            error: error.message,
            blobId: blob.id
          });
          errors.push({
            blobId: blob.id,
            error: error.message
          });
        }
      }

      logger.info('Unreferenced blob cleanup completed', {
        deletedCount,
        savedBytes,
        errors: errors.length
      });

      return {
        deletedCount,
        savedBytes,
        savedBytesFormatted: this.formatBytes(savedBytes),
        errors
      };
    } catch (error) {
      logger.error('Blob cleanup failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get deduplication statistics
   */
  async getDeduplicationStats() {
    try {
      const { sequelize } = require('../models');

      // Get total blobs
      const totalBlobs = await FileBlob.count();

      // Get total unique files (by checksum)
      const uniqueFiles = await FileBlob.count({
        distinct: true,
        col: 'checksum'
      });

      // Get total size
      const totalSize = await FileBlob.sum('size') || 0;

      // Get size that would be used without deduplication
      const [result] = await sequelize.query(`
        SELECT SUM(size * ref_count) as total_size_without_dedup
        FROM file_blobs
      `);

      const totalSizeWithoutDedup = parseInt(result[0]?.total_size_without_dedup) || 0;
      const savedBytes = totalSizeWithoutDedup - totalSize;
      const deduplicationRatio = totalSizeWithoutDedup > 0
        ? (savedBytes / totalSizeWithoutDedup) * 100
        : 0;

      // Get blobs with highest ref counts
      const mostReferencedBlobs = await FileBlob.findAll({
        order: [['ref_count', 'DESC']],
        limit: 10,
        attributes: ['id', 'checksum', 'size', 'ref_count', 'storage_backend']
      });

      logger.info('Deduplication stats calculated', {
        totalBlobs,
        uniqueFiles,
        savedBytes
      });

      return {
        totalBlobs,
        uniqueFiles,
        duplicateBlobs: totalBlobs - uniqueFiles,
        totalSize,
        totalSizeFormatted: this.formatBytes(totalSize),
        totalSizeWithoutDedup,
        totalSizeWithoutDedupFormatted: this.formatBytes(totalSizeWithoutDedup),
        savedBytes,
        savedBytesFormatted: this.formatBytes(savedBytes),
        deduplicationRatio: deduplicationRatio.toFixed(2) + '%',
        mostReferencedBlobs: mostReferencedBlobs.map(blob => ({
          id: blob.id,
          checksum: blob.checksum,
          size: blob.size,
          sizeFormatted: this.formatBytes(blob.size),
          refCount: blob.ref_count,
          backend: blob.storage_backend
        }))
      };
    } catch (error) {
      logger.error('Failed to get deduplication stats', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find duplicate files across users
   */
  async findDuplicateFilesAcrossUsers() {
    try {
      const { sequelize } = require('../models');

      const [results] = await sequelize.query(`
        SELECT
          fb.checksum,
          fb.size,
          fb.ref_count,
          COUNT(DISTINCT f.user_id) as user_count,
          array_agg(DISTINCT f.user_id) as user_ids
        FROM file_blobs fb
        JOIN files f ON f.blob_id = fb.id
        WHERE fb.ref_count > 1
        GROUP BY fb.checksum, fb.size, fb.ref_count
        HAVING COUNT(DISTINCT f.user_id) > 1
        ORDER BY fb.ref_count DESC
        LIMIT 100
      `);

      logger.info('Found duplicate files across users', {
        count: results.length
      });

      return results.map(row => ({
        checksum: row.checksum,
        size: row.size,
        sizeFormatted: this.formatBytes(row.size),
        refCount: row.ref_count,
        userCount: parseInt(row.user_count),
        savedBytes: row.size * (row.ref_count - 1),
        savedBytesFormatted: this.formatBytes(row.size * (row.ref_count - 1))
      }));
    } catch (error) {
      logger.error('Failed to find duplicate files across users', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate checksum for buffer
   */
  async calculateChecksum(buffer) {
    return await calculateSHA256(buffer);
  }

  /**
   * Verify blob integrity
   */
  async verifyBlobIntegrity(blobId) {
    try {
      const storage = require('../storage');
      const blob = await FileBlob.findByPk(blobId);

      if (!blob) {
        throw new Error('Blob not found');
      }

      // Download blob from storage
      const fileData = await storage.download(
        blob.storage_key,
        blob.storage_backend
      );

      // Calculate checksum
      const calculatedChecksum = await this.calculateChecksum(fileData.buffer);

      // Verify
      const valid = calculatedChecksum === blob.checksum;

      logger.info('Blob integrity verified', {
        blobId,
        valid,
        storedChecksum: blob.checksum,
        calculatedChecksum
      });

      return {
        valid,
        storedChecksum: blob.checksum,
        calculatedChecksum
      };
    } catch (error) {
      logger.error('Blob integrity verification failed', {
        error: error.message,
        blobId
      });
      throw error;
    }
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

module.exports = new DeduplicationService();
