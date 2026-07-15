/**
 * ═══════════════════════════════════════════════════════════════════════
 * S3 Storage Backend
 * ═══════════════════════════════════════════════════════════════════════
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { pipeline } = require('stream/promises');
const logger = require('../../utils/logger');
const crypto = require('crypto');

class S3Backend {
  constructor(config) {
    this.config = config;
    this.s3 = null;
    this.initialized = false;
  }

  /**
   * Initialize S3 client
   */
  async initialize() {
    try {
      this.s3 = new AWS.S3({
        endpoint: this.config.endpoint,
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        region: this.config.region,
        s3ForcePathStyle: true,
        signatureVersion: 'v4'
      });

      // Test connection
      await this.s3.headBucket({ Bucket: this.config.bucket }).promise();

      this.initialized = true;
      logger.info('S3 backend initialized', {
        bucket: this.config.bucket,
        region: this.config.region
      });

      return true;
    } catch (error) {
      // If bucket doesn't exist, try to create it
      if (error.code === 'NotFound' || error.code === 'NoSuchBucket') {
        try {
          await this.s3.createBucket({ Bucket: this.config.bucket }).promise();
          this.initialized = true;
          logger.info('S3 bucket created', { bucket: this.config.bucket });
          return true;
        } catch (createError) {
          logger.error('Failed to create S3 bucket', { error: createError.message });
          throw createError;
        }
      }

      logger.error('Failed to initialize S3 backend', { error: error.message });
      throw error;
    }
  }

  /**
   * Store file in S3
   */
  async store(file, options = {}) {
    if (!this.initialized) {
      throw new Error('S3 backend not initialized');
    }

    try {
      const key = options.key || this.generateKey(file.originalname);

      const params = {
        Bucket: this.config.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream',
        Metadata: options.metadata || {}
      };

      await this.s3.putObject(params).promise();

      logger.info('File stored in S3', { key, bucket: this.config.bucket });

      return {
        key,
        backend: 's3',
        url: `${this.config.endpoint}/${this.config.bucket}/${key}`
      };
    } catch (error) {
      logger.error('Failed to store file in S3', { error: error.message });
      throw error;
    }
  }

  /**
   * Retrieve file from S3
   */
  async retrieve(key) {
    if (!this.initialized) {
      throw new Error('S3 backend not initialized');
    }

    try {
      const params = {
        Bucket: this.config.bucket,
        Key: key
      };

      const data = await this.s3.getObject(params).promise();

      logger.info('File retrieved from S3', { key });

      return data.Body;
    } catch (error) {
      logger.error('Failed to retrieve file from S3', {
        error: error.message,
        key
      });
      throw error;
    }
  }

  /**
   * Stream an S3 object to a local destination path WITHOUT buffering the whole
   * object in memory (OOM guard for large media). Uses the SDK's readable
   * stream rather than getObject().promise() (which resolves a full Buffer).
   *
   * The caller owns creating the parent directory of `destPath`.
   *
   * @param {string} key      object key
   * @param {string} destPath local path to stream into
   * @returns {Promise<{path: string, bytesWritten: number}>}
   */
  async retrieveToFile(key, destPath) {
    if (!this.initialized) {
      throw new Error('S3 backend not initialized');
    }

    if (!destPath || typeof destPath !== 'string') {
      throw new Error('retrieveToFile requires a destination path');
    }

    const dest = path.resolve(destPath);

    try {
      const params = {
        Bucket: this.config.bucket,
        Key: key
      };

      const readStream = this.s3.getObject(params).createReadStream();

      await pipeline(readStream, fs.createWriteStream(dest));

      const { size } = await fsp.stat(dest);

      logger.info('File streamed from S3', { key, dest, bytesWritten: size });

      return { path: dest, bytesWritten: size };
    } catch (error) {
      logger.error('Failed to stream file from S3', {
        error: error.message,
        key
      });
      throw error;
    }
  }

  /**
   * Delete file from S3
   */
  async delete(key) {
    if (!this.initialized) {
      throw new Error('S3 backend not initialized');
    }

    try {
      const params = {
        Bucket: this.config.bucket,
        Key: key
      };

      await this.s3.deleteObject(params).promise();

      logger.info('File deleted from S3', { key });

      return { success: true, key };
    } catch (error) {
      logger.error('Failed to delete file from S3', {
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
      throw new Error('S3 backend not initialized');
    }

    try {
      const params = {
        Bucket: this.config.bucket
      };

      let totalSize = 0;
      let fileCount = 0;

      // List all objects and calculate total size
      const listObjects = async (continuationToken) => {
        const listParams = {
          ...params,
          ContinuationToken: continuationToken
        };

        const data = await this.s3.listObjectsV2(listParams).promise();

        fileCount += data.Contents?.length || 0;
        totalSize += data.Contents?.reduce((sum, obj) => sum + obj.Size, 0) || 0;

        if (data.IsTruncated) {
          await listObjects(data.NextContinuationToken);
        }
      };

      await listObjects();

      return {
        backend: 's3',
        bucket: this.config.bucket,
        fileCount,
        totalSize,
        maxFileSize: this.config.maxFileSize,
        healthy: true
      };
    } catch (error) {
      logger.error('Failed to get S3 stats', { error: error.message });
      return {
        backend: 's3',
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
      await this.s3.headBucket({ Bucket: this.config.bucket }).promise();

      return {
        healthy: true,
        backend: 's3',
        bucket: this.config.bucket
      };
    } catch (error) {
      logger.error('S3 health check failed', { error: error.message });

      return {
        healthy: false,
        backend: 's3',
        error: error.message
      };
    }
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
}

module.exports = S3Backend;
