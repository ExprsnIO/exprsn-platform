/**
 * ═══════════════════════════════════════════════════════════════════════
 * File Upload Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const sharp = require('sharp');
const crypto = require('crypto');
const path = require('path');
const logger = require('../utils/logger');
const storage = require('../storage');
const fileValidator = require('../utils/fileValidator');
const { calculateSHA256 } = require('../utils/checksum');

class UploadService {
  constructor() {
    this.chunkUploads = new Map(); // Store in-progress chunked uploads
  }

  /**
   * Handle file upload
   */
  async handleUpload(file, options = {}) {
    try {
      logger.info('Processing file upload', {
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype
      });

      // Validate file
      await this.validateFile(file, options);

      // Extract metadata
      const metadata = await this.extractMetadata(file);

      // Calculate checksum
      const checksum = await this.calculateChecksum(file);

      // Process image if applicable
      if (this.isImage(file)) {
        file = await this.processImage(file, options.imageOptions);
      }

      // Select storage backend
      const backend = options.backend || 'default';

      // Upload to storage
      const uploadResult = await storage.upload(file, {
        backend,
        metadata: {
          checksum,
          uploadedBy: options.userId,
          originalName: file.originalname,
          contentType: file.mimetype,
          ...metadata
        }
      });

      logger.info('File upload completed', {
        filename: file.originalname,
        backend: uploadResult.backend,
        key: uploadResult.key
      });

      return {
        ...uploadResult,
        checksum,
        metadata
      };
    } catch (error) {
      logger.error('File upload failed', {
        error: error.message,
        filename: file.originalname
      });
      throw error;
    }
  }

  /**
   * Initialize chunked upload for large files
   */
  async initChunkedUpload(options = {}) {
    try {
      const uploadId = crypto.randomUUID();

      this.chunkUploads.set(uploadId, {
        id: uploadId,
        filename: options.filename,
        totalSize: options.totalSize,
        chunkSize: options.chunkSize || 5 * 1024 * 1024, // 5MB default
        chunks: [],
        uploadedBytes: 0,
        createdAt: Date.now(),
        userId: options.userId,
        backend: options.backend || 'default'
      });

      logger.info('Chunked upload initialized', {
        uploadId,
        filename: options.filename,
        totalSize: options.totalSize
      });

      return {
        uploadId,
        chunkSize: this.chunkUploads.get(uploadId).chunkSize
      };
    } catch (error) {
      logger.error('Failed to initialize chunked upload', { error: error.message });
      throw error;
    }
  }

  /**
   * Handle chunk upload
   */
  async uploadChunk(uploadId, chunkNumber, chunkData) {
    try {
      const upload = this.chunkUploads.get(uploadId);

      if (!upload) {
        throw new Error('Upload session not found');
      }

      // Store chunk
      upload.chunks[chunkNumber] = chunkData;
      upload.uploadedBytes += chunkData.length;

      logger.info('Chunk uploaded', {
        uploadId,
        chunkNumber,
        chunkSize: chunkData.length,
        progress: (upload.uploadedBytes / upload.totalSize) * 100
      });

      return {
        uploadId,
        chunkNumber,
        uploadedBytes: upload.uploadedBytes,
        totalSize: upload.totalSize,
        progress: (upload.uploadedBytes / upload.totalSize) * 100
      };
    } catch (error) {
      logger.error('Chunk upload failed', {
        error: error.message,
        uploadId,
        chunkNumber
      });
      throw error;
    }
  }

  /**
   * Complete chunked upload
   */
  async completeChunkedUpload(uploadId) {
    try {
      const upload = this.chunkUploads.get(uploadId);

      if (!upload) {
        throw new Error('Upload session not found');
      }

      // Validate all chunks are present
      const expectedChunks = Math.ceil(upload.totalSize / upload.chunkSize);
      if (upload.chunks.length !== expectedChunks) {
        throw new Error('Missing chunks');
      }

      // Combine chunks
      const buffer = Buffer.concat(upload.chunks);

      // Create file object
      const file = {
        originalname: upload.filename,
        buffer,
        size: buffer.length,
        mimetype: this.detectMimeType(upload.filename)
      };

      // Upload combined file
      const result = await this.handleUpload(file, {
        userId: upload.userId,
        backend: upload.backend
      });

      // Cleanup
      this.chunkUploads.delete(uploadId);

      logger.info('Chunked upload completed', {
        uploadId,
        filename: upload.filename,
        size: buffer.length
      });

      return result;
    } catch (error) {
      logger.error('Failed to complete chunked upload', {
        error: error.message,
        uploadId
      });
      throw error;
    }
  }

  /**
   * Abort chunked upload
   */
  async abortChunkedUpload(uploadId) {
    this.chunkUploads.delete(uploadId);
    logger.info('Chunked upload aborted', { uploadId });
    return { success: true };
  }

  /**
   * Process image (resize, compress, generate thumbnails)
   */
  async processImage(file, options = {}) {
    try {
      if (!this.isImage(file)) {
        return file;
      }

      logger.info('Processing image', {
        filename: file.originalname,
        originalSize: file.size
      });

      let image = sharp(file.buffer);
      const metadata = await image.metadata();

      // Auto-orient based on EXIF
      image = image.rotate();

      // Resize if needed
      if (options.maxWidth || options.maxHeight) {
        image = image.resize(options.maxWidth, options.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }

      // Compress
      if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
        image = image.jpeg({
          quality: options.quality || 85,
          progressive: true
        });
      } else if (metadata.format === 'png') {
        image = image.png({
          compressionLevel: options.compressionLevel || 8
        });
      } else if (metadata.format === 'webp') {
        image = image.webp({
          quality: options.quality || 85
        });
      }

      // Generate processed buffer
      const processedBuffer = await image.toBuffer();

      file.buffer = processedBuffer;
      file.size = processedBuffer.length;

      logger.info('Image processed', {
        filename: file.originalname,
        originalSize: file.size,
        processedSize: processedBuffer.length,
        compression: ((1 - processedBuffer.length / file.size) * 100).toFixed(2) + '%'
      });

      return file;
    } catch (error) {
      logger.error('Image processing failed', {
        error: error.message,
        filename: file.originalname
      });
      // Return original file if processing fails
      return file;
    }
  }

  /**
   * Extract file metadata
   */
  async extractMetadata(file) {
    try {
      const metadata = {
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        extension: path.extname(file.originalname).toLowerCase()
      };

      // Extract image metadata if applicable
      if (this.isImage(file)) {
        try {
          const image = sharp(file.buffer);
          const imageMetadata = await image.metadata();

          metadata.image = {
            width: imageMetadata.width,
            height: imageMetadata.height,
            format: imageMetadata.format,
            space: imageMetadata.space,
            channels: imageMetadata.channels,
            depth: imageMetadata.depth,
            hasAlpha: imageMetadata.hasAlpha
          };

          // Extract EXIF data
          if (imageMetadata.exif) {
            metadata.exif = this.parseExif(imageMetadata.exif);
          }
        } catch (error) {
          logger.warn('Failed to extract image metadata', {
            error: error.message,
            filename: file.originalname
          });
        }
      }

      return metadata;
    } catch (error) {
      logger.error('Failed to extract metadata', {
        error: error.message,
        filename: file.originalname
      });
      return {};
    }
  }

  /**
   * Parse EXIF data
   */
  parseExif(exifBuffer) {
    // This is a simplified version
    // In production, use a library like 'exif-parser'
    return {
      raw: exifBuffer.toString('base64')
    };
  }

  /**
   * Validate file
   */
  async validateFile(file, options = {}) {
    // Validate file size
    const maxSize = options.maxSize || 10 * 1024 * 1024 * 1024; // 10GB default
    if (file.size > maxSize) {
      throw new Error(`File size exceeds maximum allowed size of ${this.formatBytes(maxSize)}`);
    }

    // Validate MIME type
    if (options.allowedMimeTypes) {
      if (!fileValidator.validateMimeType(file, options.allowedMimeTypes)) {
        throw new Error('File type not allowed');
      }
    }

    // Detect actual file type (not just extension)
    const detectedType = await fileValidator.detectFileType(file.buffer);
    if (detectedType && detectedType !== file.mimetype) {
      logger.warn('File type mismatch', {
        declared: file.mimetype,
        detected: detectedType,
        filename: file.originalname
      });
    }

    // Sanitize filename
    file.originalname = fileValidator.sanitizeFilename(file.originalname);

    return true;
  }

  /**
   * Calculate file checksum
   */
  async calculateChecksum(file) {
    return await calculateSHA256(file.buffer);
  }

  /**
   * Check if file is an image
   */
  isImage(file) {
    return file.mimetype?.startsWith('image/');
  }

  /**
   * Detect MIME type from filename
   */
  detectMimeType(filename) {
    const mime = require('mime-types');
    return mime.lookup(filename) || 'application/octet-stream';
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

  /**
   * Cleanup old upload sessions (older than 24 hours)
   */
  cleanupOldSessions() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [uploadId, upload] of this.chunkUploads.entries()) {
      if (now - upload.createdAt > maxAge) {
        this.chunkUploads.delete(uploadId);
        logger.info('Cleaned up old upload session', { uploadId });
      }
    }
  }
}

module.exports = new UploadService();
