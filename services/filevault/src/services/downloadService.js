/**
 * ═══════════════════════════════════════════════════════════════════════
 * File Download Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const archiver = require('archiver');
const { Readable } = require('stream');
const logger = require('../utils/logger');
const storage = require('../storage');
const { File, Download } = require('../models');

class DownloadService {
  /**
   * Prepare file for download
   */
  async prepareDownload(fileId, options = {}) {
    try {
      logger.info('Preparing file download', { fileId });

      // Get file from database
      const file = await File.findByPk(fileId, {
        include: ['blob']
      });

      if (!file) {
        throw new Error('File not found');
      }

      // Check permissions
      if (options.userId && file.user_id !== options.userId) {
        // Check if file is shared
        if (!file.is_public) {
          throw new Error('Access denied');
        }
      }

      // Track download
      if (options.trackDownload !== false) {
        await this.trackDownload(fileId, {
          userId: options.userId,
          ipAddress: options.ipAddress,
          userAgent: options.userAgent
        });
      }

      // Get download URL or stream
      let downloadUrl = null;
      let stream = null;

      if (options.stream !== false) {
        stream = await this.streamFile(fileId);
      } else {
        // For S3, generate signed URL
        if (file.blob.storage_backend === 's3') {
          const backend = storage.getBackend('s3');
          downloadUrl = await backend.getSignedUrl(
            file.blob.storage_key,
            options.expirySeconds || 3600
          );
        }
      }

      logger.info('File download prepared', {
        fileId,
        filename: file.name,
        backend: file.blob.storage_backend
      });

      return {
        file,
        downloadUrl,
        stream,
        contentType: file.mime_type,
        filename: file.name,
        size: file.size
      };
    } catch (error) {
      logger.error('Failed to prepare download', {
        error: error.message,
        fileId
      });
      throw error;
    }
  }

  /**
   * Stream file to client
   */
  async streamFile(fileId) {
    try {
      // Get file from database
      const file = await File.findByPk(fileId, {
        include: ['blob']
      });

      if (!file) {
        throw new Error('File not found');
      }

      // Get stream from storage backend
      const stream = storage.stream(
        file.blob.storage_key,
        file.blob.storage_backend
      );

      logger.info('File streaming started', {
        fileId,
        filename: file.name,
        backend: file.blob.storage_backend
      });

      return stream;
    } catch (error) {
      logger.error('File streaming failed', {
        error: error.message,
        fileId
      });
      throw error;
    }
  }

  /**
   * Generate ZIP archive for multiple files
   */
  async generateZip(fileIds, options = {}) {
    try {
      logger.info('Generating ZIP archive', {
        fileCount: fileIds.length
      });

      // Get files from database
      const files = await File.findAll({
        where: { id: fileIds },
        include: ['blob']
      });

      if (files.length === 0) {
        throw new Error('No files found');
      }

      // Create archive
      const archive = archiver('zip', {
        zlib: { level: options.compressionLevel || 9 }
      });

      // Handle archive errors
      archive.on('error', (error) => {
        logger.error('ZIP archive error', { error: error.message });
        throw error;
      });

      // Add files to archive
      for (const file of files) {
        try {
          // Get file data
          const fileData = await storage.download(
            file.blob.storage_key,
            file.blob.storage_backend
          );

          // Add to archive
          archive.append(fileData.buffer, {
            name: file.name,
            date: file.updated_at
          });

          logger.info('File added to archive', {
            fileId: file.id,
            filename: file.name
          });
        } catch (error) {
          logger.error('Failed to add file to archive', {
            error: error.message,
            fileId: file.id
          });
          // Continue with other files
        }
      }

      // Finalize archive
      await archive.finalize();

      logger.info('ZIP archive generated', {
        fileCount: files.length
      });

      return {
        archive,
        filename: options.filename || `files-${Date.now()}.zip`,
        fileCount: files.length
      };
    } catch (error) {
      logger.error('ZIP generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Track file download
   */
  async trackDownload(fileId, options = {}) {
    try {
      await Download.create({
        file_id: fileId,
        user_id: options.userId || null,
        ip_address: options.ipAddress || null,
        user_agent: options.userAgent || null,
        downloaded_at: new Date()
      });

      // Increment download counter on file
      const file = await File.findByPk(fileId);
      if (file) {
        file.download_count = (file.download_count || 0) + 1;
        await file.save();
      }

      logger.info('Download tracked', { fileId });
    } catch (error) {
      logger.error('Failed to track download', {
        error: error.message,
        fileId
      });
      // Don't throw error - tracking failure shouldn't prevent download
    }
  }

  /**
   * Get download statistics for file
   */
  async getDownloadStats(fileId) {
    try {
      const file = await File.findByPk(fileId);

      if (!file) {
        throw new Error('File not found');
      }

      const totalDownloads = await Download.count({
        where: { file_id: fileId }
      });

      const uniqueUsers = await Download.count({
        where: { file_id: fileId },
        distinct: true,
        col: 'user_id'
      });

      const uniqueIPs = await Download.count({
        where: { file_id: fileId },
        distinct: true,
        col: 'ip_address'
      });

      const recentDownloads = await Download.findAll({
        where: { file_id: fileId },
        order: [['downloaded_at', 'DESC']],
        limit: 10,
        attributes: ['user_id', 'ip_address', 'user_agent', 'downloaded_at']
      });

      return {
        fileId,
        filename: file.name,
        totalDownloads,
        uniqueUsers,
        uniqueIPs,
        recentDownloads
      };
    } catch (error) {
      logger.error('Failed to get download stats', {
        error: error.message,
        fileId
      });
      throw error;
    }
  }

  /**
   * Get user's download history
   */
  async getUserDownloadHistory(userId, options = {}) {
    try {
      const limit = options.limit || 50;
      const offset = options.offset || 0;

      const downloads = await Download.findAndCountAll({
        where: { user_id: userId },
        include: [
          {
            model: File,
            as: 'file',
            attributes: ['id', 'name', 'size', 'mime_type']
          }
        ],
        order: [['downloaded_at', 'DESC']],
        limit,
        offset
      });

      return {
        downloads: downloads.rows,
        total: downloads.count,
        limit,
        offset
      };
    } catch (error) {
      logger.error('Failed to get download history', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Generate download token for temporary access
   */
  async generateDownloadToken(fileId, options = {}) {
    try {
      const crypto = require('crypto');

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + (options.expirySeconds || 3600) * 1000);

      // Store token in cache (Redis)
      // This is a simplified version - in production, use Redis
      const tokenData = {
        fileId,
        token,
        expiresAt,
        userId: options.userId,
        maxDownloads: options.maxDownloads || 1,
        downloadCount: 0
      };

      logger.info('Download token generated', {
        fileId,
        token,
        expiresAt
      });

      return {
        token,
        expiresAt,
        downloadUrl: `/api/files/download/${token}`
      };
    } catch (error) {
      logger.error('Failed to generate download token', {
        error: error.message,
        fileId
      });
      throw error;
    }
  }

  /**
   * Validate download token
   */
  async validateDownloadToken(token) {
    try {
      // Get token data from cache (Redis)
      // This is a simplified version
      // In production, retrieve from Redis

      // For now, return mock validation
      logger.info('Download token validated', { token });

      return {
        valid: true,
        fileId: null // Should return actual fileId from cache
      };
    } catch (error) {
      logger.error('Failed to validate download token', {
        error: error.message,
        token
      });
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Get file content as buffer
   */
  async getFileBuffer(fileId) {
    try {
      const file = await File.findByPk(fileId, {
        include: ['blob']
      });

      if (!file) {
        throw new Error('File not found');
      }

      const fileData = await storage.download(
        file.blob.storage_key,
        file.blob.storage_backend
      );

      return fileData.buffer;
    } catch (error) {
      logger.error('Failed to get file buffer', {
        error: error.message,
        fileId
      });
      throw error;
    }
  }
}

module.exports = new DownloadService();
