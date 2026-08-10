/**
 * ═══════════════════════════════════════════════════════════
 * Asset Service
 * Business logic for media and file asset management
 * ═══════════════════════════════════════════════════════════
 */

const PageAsset = require('../models/PageAsset');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

class AssetService {
  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB default
    this.allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'video/mp4',
      'video/webm',
      'application/pdf',
      'text/plain',
      'text/markdown'
    ];
  }

  /**
   * Initialize upload directory
   */
  async initializeUploadDirectory() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      logger.info('Upload directory initialized', { path: this.uploadDir });
    } catch (error) {
      logger.error('Failed to create upload directory', {
        error: error.message,
        path: this.uploadDir
      });
      throw error;
    }
  }

  /**
   * Upload a file
   */
  async uploadFile(file, userId, options = {}) {
    try {
      // Validate file
      this.validateFile(file);

      // Generate unique filename
      const filename = this.generateFilename(file.originalname);
      const filePath = path.join(this.uploadDir, filename);

      // Save file to disk
      await fs.writeFile(filePath, file.buffer);

      // Extract metadata
      const metadata = await this.extractMetadata(file, filePath);

      // Create database record
      const asset = await PageAsset.create({
        uploaded_by: userId,
        page_id: options.pageId || null,
        file_name: file.originalname,
        file_path: filename,
        file_type: file.mimetype,
        file_size: file.size,
        width: metadata.width,
        height: metadata.height,
        alt_text: options.altText,
        title: options.title,
        description: options.description,
        tags: options.tags || [],
        is_public: options.isPublic !== undefined ? options.isPublic : false,
        metadata: metadata.additional || {}
      });

      logger.info('File uploaded', {
        assetId: asset.id,
        filename: asset.file_name,
        userId
      });

      return asset;
    } catch (error) {
      logger.error('Failed to upload file', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Validate uploaded file
   */
  validateFile(file) {
    if (!file) {
      throw new AppError('No file provided', 400);
    }

    if (file.size > this.maxFileSize) {
      throw new AppError(
        `File size exceeds maximum allowed size of ${this.maxFileSize} bytes`,
        400
      );
    }

    if (!this.allowedTypes.includes(file.mimetype)) {
      throw new AppError(
        `File type '${file.mimetype}' is not allowed`,
        400
      );
    }
  }

  /**
   * Generate unique filename
   */
  generateFilename(originalname) {
    const ext = path.extname(originalname);
    const hash = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    return `${timestamp}-${hash}${ext}`;
  }

  /**
   * Extract file metadata
   */
  async extractMetadata(file, filePath) {
    const metadata = {
      width: null,
      height: null,
      additional: {}
    };

    // Extract image dimensions if it's an image
    if (file.mimetype.startsWith('image/')) {
      try {
        const sharp = require('sharp');
        const imageInfo = await sharp(filePath).metadata();
        metadata.width = imageInfo.width;
        metadata.height = imageInfo.height;
        metadata.additional.format = imageInfo.format;
        metadata.additional.space = imageInfo.space;
        metadata.additional.hasAlpha = imageInfo.hasAlpha;

        // Extract EXIF data if available
        if (imageInfo.exif) {
          metadata.additional.exif = imageInfo.exif;
        }
      } catch (error) {
        logger.warn('Failed to extract image metadata', {
          error: error.message,
          filePath
        });
      }
    }

    return metadata;
  }

  /**
   * Get asset by ID
   */
  async getAsset(assetId, userId = null) {
    try {
      const asset = await PageAsset.findByPk(assetId);

      if (!asset) {
        throw new AppError('Asset not found', 404);
      }

      // Check access
      if (!asset.canAccess(userId)) {
        throw new AppError('Access denied', 403);
      }

      return asset;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to get asset', { error: error.message, assetId });
      throw error;
    }
  }

  /**
   * List assets with filters
   */
  async listAssets(filters = {}) {
    try {
      const where = {};

      if (filters.pageId) {
        where.page_id = filters.pageId;
      }

      if (filters.uploadedBy) {
        where.uploaded_by = filters.uploadedBy;
      }

      if (filters.fileType) {
        where.file_type = filters.fileType;
      }

      if (filters.isPublic !== undefined) {
        where.is_public = filters.isPublic;
      }

      if (filters.tags && filters.tags.length > 0) {
        where.tags = {
          [require('sequelize').Op.overlap]: filters.tags
        };
      }

      const orderBy = filters.orderBy || 'created_at';
      const orderDirection = filters.orderDirection || 'DESC';

      const assets = await PageAsset.findAll({
        where,
        order: [[orderBy, orderDirection]],
        limit: filters.limit || 50,
        offset: filters.offset || 0
      });

      return assets;
    } catch (error) {
      logger.error('Failed to list assets', { error: error.message });
      throw error;
    }
  }

  /**
   * Update asset metadata
   */
  async updateAsset(assetId, updates, userId) {
    try {
      const asset = await this.getAsset(assetId, userId);

      // Only owner can update
      if (asset.uploaded_by !== userId) {
        throw new AppError('Only asset owner can update it', 403);
      }

      const allowedFields = [
        'alt_text', 'title', 'description', 'tags', 'is_public'
      ];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          asset[field] = updates[field];
        }
      }

      await asset.save();

      logger.info('Asset updated', {
        assetId: asset.id,
        userId
      });

      return asset;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to update asset', { error: error.message, assetId, userId });
      throw error;
    }
  }

  /**
   * Delete asset
   */
  async deleteAsset(assetId, userId) {
    try {
      const asset = await this.getAsset(assetId, userId);

      if (asset.uploaded_by !== userId) {
        throw new AppError('Only asset owner can delete it', 403);
      }

      // Delete file from disk
      const filePath = path.join(this.uploadDir, asset.file_path);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        logger.warn('Failed to delete file from disk', {
          error: error.message,
          filePath
        });
      }

      // Delete database record
      await asset.destroy();

      logger.info('Asset deleted', {
        assetId: asset.id,
        userId
      });

      return true;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to delete asset', { error: error.message, assetId, userId });
      throw error;
    }
  }

  /**
   * Get asset file path
   */
  getAssetFilePath(asset) {
    return path.join(this.uploadDir, asset.file_path);
  }

  /**
   * Get asset URL
   */
  getAssetUrl(asset) {
    return asset.getUrl();
  }

  /**
   * Get assets by page
   */
  async getPageAssets(pageId, userId = null) {
    try {
      const assets = await PageAsset.findAll({
        where: { page_id: pageId },
        order: [['created_at', 'DESC']]
      });

      // Filter by access
      return assets.filter(asset => asset.canAccess(userId));
    } catch (error) {
      logger.error('Failed to get page assets', { error: error.message, pageId });
      throw error;
    }
  }

  /**
   * Search assets by keyword
   */
  async searchAssets(keyword, filters = {}) {
    try {
      const { Op } = require('sequelize');

      const where = {
        [Op.or]: [
          { file_name: { [Op.iLike]: `%${keyword}%` } },
          { title: { [Op.iLike]: `%${keyword}%` } },
          { description: { [Op.iLike]: `%${keyword}%` } },
          { tags: { [Op.overlap]: [keyword] } }
        ]
      };

      if (filters.fileType) {
        where.file_type = filters.fileType;
      }

      if (filters.uploadedBy) {
        where.uploaded_by = filters.uploadedBy;
      }

      if (filters.isPublic !== undefined) {
        where.is_public = filters.isPublic;
      }

      const assets = await PageAsset.findAll({
        where,
        order: [['created_at', 'DESC']],
        limit: filters.limit || 20,
        offset: filters.offset || 0
      });

      return assets;
    } catch (error) {
      logger.error('Failed to search assets', { error: error.message, keyword });
      throw error;
    }
  }

  /**
   * Get storage statistics for user
   */
  async getUserStorageStats(userId) {
    try {
      const { sequelize } = require('../config/database');

      const stats = await PageAsset.findAll({
        where: { uploaded_by: userId },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'total_files'],
          [sequelize.fn('SUM', sequelize.col('file_size')), 'total_size'],
          [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('file_type'))), 'file_types']
        ],
        raw: true
      });

      return stats[0];
    } catch (error) {
      logger.error('Failed to get storage stats', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Get storage statistics by file type
   */
  async getStorageStatsByType(userId) {
    try {
      const { sequelize } = require('../config/database');

      const stats = await PageAsset.findAll({
        where: { uploaded_by: userId },
        attributes: [
          'file_type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('file_size')), 'total_size']
        ],
        group: ['file_type'],
        order: [[sequelize.literal('total_size'), 'DESC']],
        raw: true
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get storage stats by type', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Clean up orphaned assets (no page reference)
   */
  async cleanupOrphanedAssets(olderThanDays = 30) {
    try {
      const { Op } = require('sequelize');
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const orphanedAssets = await PageAsset.findAll({
        where: {
          page_id: null,
          created_at: {
            [Op.lt]: cutoffDate
          }
        }
      });

      let deletedCount = 0;
      for (const asset of orphanedAssets) {
        try {
          const filePath = path.join(this.uploadDir, asset.file_path);
          await fs.unlink(filePath);
          await asset.destroy();
          deletedCount++;
        } catch (error) {
          logger.warn('Failed to delete orphaned asset', {
            assetId: asset.id,
            error: error.message
          });
        }
      }

      logger.info('Cleaned up orphaned assets', {
        deletedCount,
        olderThanDays
      });

      return { deletedCount, total: orphanedAssets.length };
    } catch (error) {
      logger.error('Failed to cleanup orphaned assets', { error: error.message });
      throw error;
    }
  }
}

module.exports = new AssetService();
