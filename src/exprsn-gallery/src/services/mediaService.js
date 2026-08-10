/**
 * ═══════════════════════════════════════════════════════════════════════
 * Media Service - Media Processing and Management
 * ═══════════════════════════════════════════════════════════════════════
 */

const sharp = require('sharp');
const exifParser = require('exif-parser');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const logger = require('../utils/logger');
const Media = require('../models/Media');
const videoService = require('./videoService');
const { addVideoProcessingJob } = require('../queues/mediaQueue');

class MediaService {
  /**
   * Process uploaded image
   * @param {Buffer} buffer - Image buffer
   * @param {Object} metadata - File metadata
   * @returns {Promise<Object>}
   */
  async processImage(buffer, metadata) {
    try {
      // Extract EXIF data
      const exifData = await this.extractExif(buffer);

      // Get image dimensions
      const imageMetadata = await sharp(buffer).metadata();

      // Generate thumbnails
      const thumbnails = await this.generateThumbnails(buffer, metadata.filename);

      // Calculate content hash for deduplication
      const contentHash = this.calculateHash(buffer);

      return {
        width: imageMetadata.width,
        height: imageMetadata.height,
        exifData,
        thumbnails,
        contentHash,
        format: imageMetadata.format
      };

    } catch (error) {
      logger.error('Image processing error:', error);
      throw new Error('Failed to process image: ' + error.message);
    }
  }

  /**
   * Extract EXIF data from image
   * @param {Buffer} buffer - Image buffer
   * @returns {Promise<Object>}
   */
  async extractExif(buffer) {
    try {
      const parser = exifParser.create(buffer);
      const result = parser.parse();

      return {
        make: result.tags.Make || null,
        model: result.tags.Model || null,
        dateTime: result.tags.DateTime ? new Date(result.tags.DateTime * 1000) : null,
        orientation: result.tags.Orientation || 1,
        imageSize: result.imageSize,
        gps: result.tags.GPSLatitude && result.tags.GPSLongitude ? {
          latitude: result.tags.GPSLatitude,
          longitude: result.tags.GPSLongitude,
          altitude: result.tags.GPSAltitude
        } : null,
        exposureTime: result.tags.ExposureTime,
        fNumber: result.tags.FNumber,
        iso: result.tags.ISO,
        focalLength: result.tags.FocalLength,
        lens: result.tags.LensModel
      };

    } catch (error) {
      logger.warn('EXIF extraction failed:', error.message);
      return null;
    }
  }

  /**
   * Generate thumbnails for image
   * @param {Buffer} buffer - Image buffer
   * @param {string} filename - Original filename
   * @returns {Promise<Array>}
   */
  async generateThumbnails(buffer, filename) {
    const thumbnails = [];
    const sizes = config.media.thumbnailSizes;

    for (const size of sizes) {
      try {
        const thumbnail = await sharp(buffer)
          .resize(size, size, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .webp({ quality: 85 })
          .toBuffer();

        const thumbFilename = this.getThumbnailFilename(filename, size);
        const thumbPath = await this.saveThumbnail(thumbnail, thumbFilename);

        thumbnails.push({
          size: `${size}x${size}`,
          width: size,
          height: size,
          filename: thumbFilename,
          path: thumbPath,
          url: this.buildThumbnailUrl(thumbFilename)
        });

      } catch (error) {
        logger.error(`Failed to generate ${size}x${size} thumbnail:`, error);
      }
    }

    return thumbnails;
  }

  /**
   * Save thumbnail to storage
   * @param {Buffer} buffer - Thumbnail buffer
   * @param {string} filename - Thumbnail filename
   * @returns {Promise<string>}
   */
  async saveThumbnail(buffer, filename) {
    const thumbDir = path.join(config.media.localStoragePath, 'thumbnails');

    // Ensure directory exists
    await fs.mkdir(thumbDir, { recursive: true });

    const thumbPath = path.join(thumbDir, filename);
    await fs.writeFile(thumbPath, buffer);

    return thumbPath;
  }

  /**
   * Get thumbnail filename
   * @param {string} originalFilename - Original filename
   * @param {number} size - Thumbnail size
   * @returns {string}
   */
  getThumbnailFilename(originalFilename, size) {
    const ext = path.extname(originalFilename);
    const name = path.basename(originalFilename, ext);
    const timestamp = Date.now();

    return `${name}_${size}x${size}_${timestamp}.webp`;
  }

  /**
   * Build thumbnail URL
   * @param {string} filename - Thumbnail filename
   * @returns {string}
   */
  buildThumbnailUrl(filename) {
    if (config.cdn.enabled) {
      return `${config.cdn.endpoint}/thumbnails/${filename}`;
    }

    return `/thumbnails/${filename}`;
  }

  /**
   * Calculate content hash (SHA-256)
   * @param {Buffer} buffer - File buffer
   * @returns {string}
   */
  calculateHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Save media file to storage
   * @param {Buffer} buffer - File buffer
   * @param {string} filename - Filename
   * @returns {Promise<string>}
   */
  async saveMediaFile(buffer, filename) {
    const mediaDir = path.join(config.media.localStoragePath, 'media');

    // Ensure directory exists
    await fs.mkdir(mediaDir, { recursive: true });

    // Generate unique filename
    const timestamp = Date.now();
    const ext = path.extname(filename);
    const name = path.basename(filename, ext);
    const uniqueFilename = `${name}_${timestamp}${ext}`;

    const filePath = path.join(mediaDir, uniqueFilename);
    await fs.writeFile(filePath, buffer);

    return filePath;
  }

  /**
   * Process video (queues background job for full processing)
   * @param {Buffer} buffer - Video buffer
   * @param {Object} metadata - File metadata
   * @param {string} filePath - Saved file path
   * @param {string} mediaId - Media ID
   * @returns {Promise<Object>}
   */
  async processVideo(buffer, metadata, filePath = null, mediaId = null) {
    try {
      const contentHash = this.calculateHash(buffer);

      // Extract basic metadata quickly
      let basicMetadata = null;
      try {
        basicMetadata = await videoService.extractMetadata(buffer);
      } catch (error) {
        logger.warn('Failed to extract video metadata immediately:', error);
      }

      // Queue background job for full processing
      if (filePath && mediaId) {
        try {
          await addVideoProcessingJob(mediaId, filePath, {
            transcode: config.media.transcodeVideos || false
          });
          logger.info('Video processing job queued', { mediaId, filePath });
        } catch (error) {
          logger.error('Failed to queue video processing job:', error);
        }
      }

      return {
        contentHash,
        width: basicMetadata?.width || null,
        height: basicMetadata?.height || null,
        duration: basicMetadata?.duration || null,
        codec: basicMetadata?.codec || null,
        needsProcessing: true // Flag for background worker
      };

    } catch (error) {
      logger.error('Video processing error:', error);
      throw new Error('Failed to process video: ' + error.message);
    }
  }

  /**
   * Check for duplicate media by content hash
   * @param {string} contentHash - Content hash
   * @returns {Promise<Object|null>}
   */
  async findDuplicate(contentHash) {
    return Media.findByContentHash(contentHash);
  }

  /**
   * Detect media type from mimetype
   * @param {string} mimetype - MIME type
   * @returns {string}
   */
  getMediaType(mimetype) {
    if (mimetype.startsWith('image/')) {
      return 'image';
    } else if (mimetype.startsWith('video/')) {
      return 'video';
    } else if (mimetype.startsWith('audio/')) {
      return 'audio';
    }

    throw new Error('Unsupported media type: ' + mimetype);
  }

  /**
   * Validate file size
   * @param {number} size - File size in bytes
   * @param {string} mediaType - Media type
   * @returns {boolean}
   */
  validateFileSize(size, mediaType) {
    const maxSize = mediaType === 'image'
      ? config.media.imageMaxSize
      : config.media.videoMaxSize;

    return size <= maxSize;
  }

  /**
   * Validate file format
   * @param {string} mimetype - MIME type
   * @returns {boolean}
   */
  validateFileFormat(mimetype) {
    return config.upload.allowedMimeTypes.includes(mimetype);
  }

  /**
   * Delete media file from storage
   * @param {string} filePath - File path
   * @returns {Promise<void>}
   */
  async deleteMediaFile(filePath) {
    try {
      await fs.unlink(filePath);
      logger.info('Media file deleted', { filePath });
    } catch (error) {
      logger.error('Failed to delete media file:', error);
    }
  }

  /**
   * Delete thumbnails for media
   * @param {Array} thumbnails - Thumbnail array
   * @returns {Promise<void>}
   */
  async deleteThumbnails(thumbnails) {
    for (const thumb of thumbnails) {
      try {
        await fs.unlink(thumb.path);
      } catch (error) {
        logger.error('Failed to delete thumbnail:', error);
      }
    }
  }
}

// Singleton instance
const mediaService = new MediaService();

module.exports = mediaService;
