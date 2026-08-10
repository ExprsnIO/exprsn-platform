/**
 * ═══════════════════════════════════════════════════════════════════════
 * Storage Service - Cloud Storage Abstraction Layer
 * ═══════════════════════════════════════════════════════════════════════
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const logger = require('../utils/logger');
const config = require('../config');

class StorageService {
  constructor() {
    this.backend = process.env.STORAGE_BACKEND || 'local';
    logger.info('Storage service initialized', { backend: this.backend });
  }

  /**
   * Save file to configured storage backend
   * @param {Buffer} buffer - File buffer
   * @param {string} filename - Filename
   * @param {Object} metadata - File metadata
   * @returns {Promise<Object>} Storage result { path, url, backend }
   */
  async saveFile(buffer, filename, metadata = {}) {
    try {
      switch (this.backend) {
        case 's3':
          return await this.saveToS3(buffer, filename, metadata);

        case 'filevault':
          return await this.saveToFileVault(buffer, filename, metadata);

        case 'local':
        default:
          return await this.saveToLocal(buffer, filename, metadata);
      }
    } catch (error) {
      logger.error('Save file error:', error);
      throw new Error(`Failed to save file to ${this.backend}: ${error.message}`);
    }
  }

  /**
   * Get file from storage
   * @param {string} fileId - File ID or path
   * @returns {Promise<Buffer>} File buffer
   */
  async getFile(fileId) {
    try {
      switch (this.backend) {
        case 's3':
          return await this.getFromS3(fileId);

        case 'filevault':
          return await this.getFromFileVault(fileId);

        case 'local':
        default:
          return await this.getFromLocal(fileId);
      }
    } catch (error) {
      logger.error('Get file error:', error);
      throw new Error(`Failed to get file from ${this.backend}: ${error.message}`);
    }
  }

  /**
   * Delete file from storage
   * @param {string} fileId - File ID or path
   * @returns {Promise<boolean>}
   */
  async deleteFile(fileId) {
    try {
      switch (this.backend) {
        case 's3':
          return await this.deleteFromS3(fileId);

        case 'filevault':
          return await this.deleteFromFileVault(fileId);

        case 'local':
        default:
          return await this.deleteFromLocal(fileId);
      }
    } catch (error) {
      logger.error('Delete file error:', error);
      throw new Error(`Failed to delete file from ${this.backend}: ${error.message}`);
    }
  }

  /**
   * Check if file exists
   * @param {string} fileId - File ID or path
   * @returns {Promise<boolean>}
   */
  async fileExists(fileId) {
    try {
      switch (this.backend) {
        case 's3':
          return await this.existsInS3(fileId);

        case 'filevault':
          return await this.existsInFileVault(fileId);

        case 'local':
        default:
          return await this.existsInLocal(fileId);
      }
    } catch (error) {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Local Storage Implementation
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Save to local filesystem
   * @private
   */
  async saveToLocal(buffer, filename, metadata) {
    const storagePath = config.media.localStoragePath || './storage';
    const mediaDir = path.join(storagePath, 'media');

    // Ensure directory exists
    await fs.mkdir(mediaDir, { recursive: true });

    // Generate unique filename
    const timestamp = Date.now();
    const ext = path.extname(filename);
    const name = path.basename(filename, ext);
    const uniqueFilename = `${name}_${timestamp}${ext}`;

    const filePath = path.join(mediaDir, uniqueFilename);
    await fs.writeFile(filePath, buffer);

    logger.info('File saved to local storage', {
      filename: uniqueFilename,
      size: buffer.length,
      path: filePath
    });

    return {
      path: filePath,
      url: `/media/${uniqueFilename}`,
      backend: 'local',
      size: buffer.length,
      filename: uniqueFilename
    };
  }

  /**
   * Get from local filesystem
   * @private
   */
  async getFromLocal(filePath) {
    return await fs.readFile(filePath);
  }

  /**
   * Delete from local filesystem
   * @private
   */
  async deleteFromLocal(filePath) {
    try {
      await fs.unlink(filePath);
      logger.info('File deleted from local storage', { filePath });
      return true;
    } catch (error) {
      logger.warn('Failed to delete local file:', error);
      return false;
    }
  }

  /**
   * Check if exists in local filesystem
   * @private
   */
  async existsInLocal(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AWS S3 Implementation
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Save to AWS S3
   * @private
   */
  async saveToS3(buffer, filename, metadata) {
    // Lazy load AWS SDK only when needed
    const AWS = require('aws-sdk');

    // Configure S3 client
    const s3 = new AWS.S3({
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      region: process.env.S3_REGION || 'us-east-1'
    });

    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw new Error('S3_BUCKET environment variable not set');
    }

    // Generate unique key
    const timestamp = Date.now();
    const ext = path.extname(filename);
    const name = path.basename(filename, ext);
    const key = `media/${timestamp}/${name}${ext}`;

    // Upload to S3
    const params = {
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: metadata.mimetype || 'application/octet-stream',
      Metadata: {
        originalName: filename,
        uploadedAt: new Date().toISOString(),
        ...metadata
      }
    };

    const result = await s3.upload(params).promise();

    logger.info('File saved to S3', {
      bucket,
      key,
      size: buffer.length,
      etag: result.ETag
    });

    return {
      path: key,
      url: result.Location,
      backend: 's3',
      size: buffer.length,
      filename: key,
      etag: result.ETag
    };
  }

  /**
   * Get from AWS S3
   * @private
   */
  async getFromS3(key) {
    const AWS = require('aws-sdk');

    const s3 = new AWS.S3({
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      region: process.env.S3_REGION || 'us-east-1'
    });

    const bucket = process.env.S3_BUCKET;

    const params = {
      Bucket: bucket,
      Key: key
    };

    const data = await s3.getObject(params).promise();
    return data.Body;
  }

  /**
   * Delete from AWS S3
   * @private
   */
  async deleteFromS3(key) {
    const AWS = require('aws-sdk');

    const s3 = new AWS.S3({
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      region: process.env.S3_REGION || 'us-east-1'
    });

    const bucket = process.env.S3_BUCKET;

    await s3.deleteObject({
      Bucket: bucket,
      Key: key
    }).promise();

    logger.info('File deleted from S3', { bucket, key });
    return true;
  }

  /**
   * Check if exists in AWS S3
   * @private
   */
  async existsInS3(key) {
    const AWS = require('aws-sdk');

    const s3 = new AWS.S3({
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      region: process.env.S3_REGION || 'us-east-1'
    });

    const bucket = process.env.S3_BUCKET;

    try {
      await s3.headObject({
        Bucket: bucket,
        Key: key
      }).promise();
      return true;
    } catch {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FileVault Integration
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Save to FileVault service
   * @private
   */
  async saveToFileVault(buffer, filename, metadata) {
    const filevaultUrl = process.env.FILEVAULT_SERVICE_URL || 'http://localhost:3007';

    // Create form data
    const form = new FormData();
    form.append('file', buffer, {
      filename,
      contentType: metadata.mimetype || 'application/octet-stream'
    });

    if (metadata.tags) {
      form.append('tags', JSON.stringify(metadata.tags));
    }

    // Upload to FileVault
    const response = await axios.post(`${filevaultUrl}/api/files/upload`, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': metadata.token ? `Bearer ${metadata.token}` : undefined
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    const fileData = response.data.file;

    logger.info('File saved to FileVault', {
      fileId: fileData.id,
      filename: fileData.filename,
      size: fileData.size
    });

    return {
      path: fileData.id,
      url: `${filevaultUrl}/api/files/${fileData.id}/download`,
      backend: 'filevault',
      size: fileData.size,
      filename: fileData.filename,
      fileVaultId: fileData.id
    };
  }

  /**
   * Get from FileVault service
   * @private
   */
  async getFromFileVault(fileId) {
    const filevaultUrl = process.env.FILEVAULT_SERVICE_URL || 'http://localhost:3007';

    const response = await axios.get(`${filevaultUrl}/api/files/${fileId}/download`, {
      responseType: 'arraybuffer'
    });

    return Buffer.from(response.data);
  }

  /**
   * Delete from FileVault service
   * @private
   */
  async deleteFromFileVault(fileId) {
    const filevaultUrl = process.env.FILEVAULT_SERVICE_URL || 'http://localhost:3007';

    await axios.delete(`${filevaultUrl}/api/files/${fileId}`);

    logger.info('File deleted from FileVault', { fileId });
    return true;
  }

  /**
   * Check if exists in FileVault
   * @private
   */
  async existsInFileVault(fileId) {
    const filevaultUrl = process.env.FILEVAULT_SERVICE_URL || 'http://localhost:3007';

    try {
      const response = await axios.head(`${filevaultUrl}/api/files/${fileId}`);
      return response.status === 200;
    } catch {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Utility Methods
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get storage backend
   * @returns {string}
   */
  getBackend() {
    return this.backend;
  }

  /**
   * Get storage statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    // This would return storage usage statistics
    // Implementation depends on backend
    return {
      backend: this.backend,
      // Add backend-specific stats
    };
  }

  /**
   * Test storage connection
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    try {
      const testBuffer = Buffer.from('test');
      const testFilename = `test_${Date.now()}.txt`;

      const result = await this.saveFile(testBuffer, testFilename, {
        mimetype: 'text/plain'
      });

      await this.deleteFile(result.path);

      logger.info('Storage connection test successful', { backend: this.backend });
      return true;

    } catch (error) {
      logger.error('Storage connection test failed:', error);
      return false;
    }
  }
}

// Singleton instance
const storageService = new StorageService();

module.exports = storageService;
