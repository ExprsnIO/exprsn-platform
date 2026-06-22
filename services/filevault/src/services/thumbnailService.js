/**
 * ═══════════════════════════════════════════════════════════════════════
 * Thumbnail Generation Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const sharp = require('sharp');
const logger = require('../utils/logger');
const storage = require('../storage');
const { Thumbnail } = require('../models');

class ThumbnailService {
  constructor() {
    this.thumbnailSizes = {
      small: { width: 150, height: 150 },
      medium: { width: 300, height: 300 },
      large: { width: 600, height: 600 }
    };
  }

  /**
   * Generate thumbnails for file
   */
  async generateThumbnails(file, fileBuffer, options = {}) {
    try {
      const sizes = options.sizes || ['small', 'medium', 'large'];
      const thumbnails = [];

      logger.info('Generating thumbnails', {
        fileId: file.id,
        filename: file.name,
        sizes
      });

      // Determine file type and generate accordingly
      if (this.isImage(file)) {
        for (const size of sizes) {
          const thumbnail = await this.generateImageThumbnail(
            file,
            fileBuffer,
            size
          );
          thumbnails.push(thumbnail);
        }
      } else if (this.isPDF(file)) {
        for (const size of sizes) {
          const thumbnail = await this.generatePDFThumbnail(
            file,
            fileBuffer,
            size
          );
          thumbnails.push(thumbnail);
        }
      } else if (this.isVideo(file)) {
        for (const size of sizes) {
          const thumbnail = await this.generateVideoThumbnail(
            file,
            fileBuffer,
            size
          );
          thumbnails.push(thumbnail);
        }
      }

      logger.info('Thumbnails generated', {
        fileId: file.id,
        count: thumbnails.length
      });

      return thumbnails;
    } catch (error) {
      logger.error('Thumbnail generation failed', {
        error: error.message,
        fileId: file.id
      });
      throw error;
    }
  }

  /**
   * Generate image thumbnail
   */
  async generateImageThumbnail(file, buffer, size) {
    try {
      const dimensions = this.thumbnailSizes[size];

      // Generate thumbnail using sharp
      const thumbnailBuffer = await sharp(buffer)
        .resize(dimensions.width, dimensions.height, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      // Get actual dimensions
      const metadata = await sharp(thumbnailBuffer).metadata();

      // Upload thumbnail to storage
      const uploadResult = await storage.upload({
        buffer: thumbnailBuffer,
        originalname: `${file.name}-thumb-${size}.jpg`,
        mimetype: 'image/jpeg',
        size: thumbnailBuffer.length
      }, {
        backend: 'default',
        metadata: {
          fileId: file.id,
          size: size,
          type: 'thumbnail'
        }
      });

      // Cache thumbnail in database
      const thumbnail = await this.cacheThumbnail(
        file.id,
        size,
        uploadResult.key,
        metadata.width,
        metadata.height,
        uploadResult.backend
      );

      logger.info('Image thumbnail generated', {
        fileId: file.id,
        size,
        dimensions: `${metadata.width}x${metadata.height}`
      });

      return thumbnail;
    } catch (error) {
      logger.error('Image thumbnail generation failed', {
        error: error.message,
        fileId: file.id,
        size
      });
      throw error;
    }
  }

  /**
   * Generate PDF thumbnail (first page)
   */
  async generatePDFThumbnail(file, buffer, size) {
    try {
      // This requires a PDF processing library like pdf-poppler or pdf2pic
      // For now, we'll return a placeholder
      logger.warn('PDF thumbnail generation not fully implemented', {
        fileId: file.id
      });

      // Generate placeholder thumbnail
      const dimensions = this.thumbnailSizes[size];
      const placeholderBuffer = await this.generatePlaceholder(
        dimensions.width,
        dimensions.height,
        'PDF'
      );

      // Upload placeholder
      const uploadResult = await storage.upload({
        buffer: placeholderBuffer,
        originalname: `${file.name}-thumb-${size}.jpg`,
        mimetype: 'image/jpeg',
        size: placeholderBuffer.length
      }, {
        backend: 'default'
      });

      const metadata = await sharp(placeholderBuffer).metadata();

      const thumbnail = await this.cacheThumbnail(
        file.id,
        size,
        uploadResult.key,
        metadata.width,
        metadata.height,
        uploadResult.backend
      );

      return thumbnail;
    } catch (error) {
      logger.error('PDF thumbnail generation failed', {
        error: error.message,
        fileId: file.id,
        size
      });
      throw error;
    }
  }

  /**
   * Generate video thumbnail (frame extraction)
   */
  async generateVideoThumbnail(file, buffer, size) {
    try {
      // This requires ffmpeg or similar video processing library
      // For now, we'll return a placeholder
      logger.warn('Video thumbnail generation not fully implemented', {
        fileId: file.id
      });

      // Generate placeholder thumbnail
      const dimensions = this.thumbnailSizes[size];
      const placeholderBuffer = await this.generatePlaceholder(
        dimensions.width,
        dimensions.height,
        'VIDEO'
      );

      // Upload placeholder
      const uploadResult = await storage.upload({
        buffer: placeholderBuffer,
        originalname: `${file.name}-thumb-${size}.jpg`,
        mimetype: 'image/jpeg',
        size: placeholderBuffer.length
      }, {
        backend: 'default'
      });

      const metadata = await sharp(placeholderBuffer).metadata();

      const thumbnail = await this.cacheThumbnail(
        file.id,
        size,
        uploadResult.key,
        metadata.width,
        metadata.height,
        uploadResult.backend
      );

      return thumbnail;
    } catch (error) {
      logger.error('Video thumbnail generation failed', {
        error: error.message,
        fileId: file.id,
        size
      });
      throw error;
    }
  }

  /**
   * Generate placeholder thumbnail
   */
  async generatePlaceholder(width, height, text) {
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="#e0e0e0"/>
        <text
          x="50%"
          y="50%"
          text-anchor="middle"
          dy=".3em"
          font-family="Arial, sans-serif"
          font-size="24"
          fill="#666"
        >${text}</text>
      </svg>
    `;

    return await sharp(Buffer.from(svg))
      .jpeg({ quality: 80 })
      .toBuffer();
  }

  /**
   * Cache thumbnail in database
   */
  async cacheThumbnail(fileId, size, storageKey, width, height, backend) {
    try {
      const thumbnail = await Thumbnail.create({
        file_id: fileId,
        size: size,
        width: width,
        height: height,
        storage_key: storageKey,
        storage_backend: backend
      });

      logger.info('Thumbnail cached', {
        fileId,
        size,
        thumbnailId: thumbnail.id
      });

      return thumbnail;
    } catch (error) {
      logger.error('Failed to cache thumbnail', {
        error: error.message,
        fileId,
        size
      });
      throw error;
    }
  }

  /**
   * Get thumbnail for file
   */
  async getThumbnail(fileId, size = 'medium') {
    try {
      const thumbnail = await Thumbnail.findOne({
        where: {
          file_id: fileId,
          size: size
        }
      });

      if (!thumbnail) {
        return null;
      }

      // Get thumbnail data from storage
      const thumbnailData = await storage.download(
        thumbnail.storage_key,
        thumbnail.storage_backend
      );

      return {
        thumbnail,
        buffer: thumbnailData.buffer,
        contentType: 'image/jpeg'
      };
    } catch (error) {
      logger.error('Failed to get thumbnail', {
        error: error.message,
        fileId,
        size
      });
      return null;
    }
  }

  /**
   * Get thumbnail URL
   */
  async getThumbnailUrl(fileId, size = 'medium') {
    try {
      const thumbnail = await Thumbnail.findOne({
        where: {
          file_id: fileId,
          size: size
        }
      });

      if (!thumbnail) {
        return null;
      }

      // Generate signed URL for S3
      if (thumbnail.storage_backend === 's3') {
        const backend = storage.getBackend('s3');
        return await backend.getSignedUrl(thumbnail.storage_key, 3600);
      }

      // For other backends, return API endpoint
      return `/api/files/${fileId}/thumbnail/${size}`;
    } catch (error) {
      logger.error('Failed to get thumbnail URL', {
        error: error.message,
        fileId,
        size
      });
      return null;
    }
  }

  /**
   * Delete thumbnails for file
   */
  async deleteThumbnails(fileId) {
    try {
      const thumbnails = await Thumbnail.findAll({
        where: { file_id: fileId }
      });

      for (const thumbnail of thumbnails) {
        try {
          // Delete from storage
          await storage.delete(thumbnail.storage_key, thumbnail.storage_backend);

          // Delete from database
          await thumbnail.destroy();

          logger.info('Thumbnail deleted', {
            fileId,
            thumbnailId: thumbnail.id
          });
        } catch (error) {
          logger.error('Failed to delete thumbnail', {
            error: error.message,
            thumbnailId: thumbnail.id
          });
        }
      }

      return { deletedCount: thumbnails.length };
    } catch (error) {
      logger.error('Failed to delete thumbnails', {
        error: error.message,
        fileId
      });
      throw error;
    }
  }

  /**
   * Regenerate thumbnails for file
   */
  async regenerateThumbnails(file, fileBuffer) {
    try {
      // Delete existing thumbnails
      await this.deleteThumbnails(file.id);

      // Generate new thumbnails
      return await this.generateThumbnails(file, fileBuffer);
    } catch (error) {
      logger.error('Failed to regenerate thumbnails', {
        error: error.message,
        fileId: file.id
      });
      throw error;
    }
  }

  /**
   * Check if file is an image
   */
  isImage(file) {
    return file.mime_type?.startsWith('image/');
  }

  /**
   * Check if file is a PDF
   */
  isPDF(file) {
    return file.mime_type === 'application/pdf';
  }

  /**
   * Check if file is a video
   */
  isVideo(file) {
    return file.mime_type?.startsWith('video/');
  }

  /**
   * Get all thumbnails for file
   */
  async getAllThumbnails(fileId) {
    try {
      const thumbnails = await Thumbnail.findAll({
        where: { file_id: fileId }
      });

      return thumbnails;
    } catch (error) {
      logger.error('Failed to get thumbnails', {
        error: error.message,
        fileId
      });
      throw error;
    }
  }
}

module.exports = new ThumbnailService();
