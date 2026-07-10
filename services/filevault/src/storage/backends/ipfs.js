/**
 * ═══════════════════════════════════════════════════════════════════════
 * IPFS Storage Backend
 * ═══════════════════════════════════════════════════════════════════════
 */

const axios = require('axios');
const FormData = require('form-data');
const logger = require('../../utils/logger');

class IPFSBackend {
  constructor(config) {
    this.config = config;
    this.initialized = false;
  }

  /**
   * Initialize IPFS client
   */
  async initialize() {
    try {
      // Test IPFS connection
      const response = await axios.post(`${this.config.apiUrl}/api/v0/version`);

      if (!response.data) {
        throw new Error('Invalid IPFS response');
      }

      this.initialized = true;
      logger.info('IPFS backend initialized', {
        apiUrl: this.config.apiUrl,
        version: response.data.Version
      });

      return true;
    } catch (error) {
      logger.error('Failed to initialize IPFS backend', { error: error.message });
      throw error;
    }
  }

  /**
   * Store file in IPFS
   */
  async store(file, options = {}) {
    if (!this.initialized) {
      throw new Error('IPFS backend not initialized');
    }

    try {
      const formData = new FormData();
      formData.append('file', file.buffer, {
        filename: file.originalname || 'file',
        contentType: file.mimetype || 'application/octet-stream'
      });

      const response = await axios.post(
        `${this.config.apiUrl}/api/v0/add`,
        formData,
        {
          headers: formData.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        }
      );

      const cid = response.data.Hash;

      logger.info('File stored in IPFS', { cid });

      return {
        key: cid,
        backend: 'ipfs',
        url: `${this.config.gatewayUrl}/ipfs/${cid}`
      };
    } catch (error) {
      logger.error('Failed to store file in IPFS', { error: error.message });
      throw error;
    }
  }

  /**
   * Retrieve file from IPFS
   */
  async retrieve(cid) {
    if (!this.initialized) {
      throw new Error('IPFS backend not initialized');
    }

    try {
      const response = await axios.post(
        `${this.config.apiUrl}/api/v0/cat?arg=${cid}`,
        null,
        {
          responseType: 'arraybuffer'
        }
      );

      logger.info('File retrieved from IPFS', { cid });

      return Buffer.from(response.data);
    } catch (error) {
      logger.error('Failed to retrieve file from IPFS', {
        error: error.message,
        cid
      });
      throw error;
    }
  }

  /**
   * Delete file from IPFS (unpin)
   */
  async delete(cid) {
    if (!this.initialized) {
      throw new Error('IPFS backend not initialized');
    }

    try {
      // Unpin the file (note: this doesn't delete it from the network)
      await axios.post(`${this.config.apiUrl}/api/v0/pin/rm?arg=${cid}`);

      logger.info('File unpinned from IPFS', { cid });

      return { success: true, key: cid };
    } catch (error) {
      logger.error('Failed to unpin file from IPFS', {
        error: error.message,
        cid
      });
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    if (!this.initialized) {
      throw new Error('IPFS backend not initialized');
    }

    try {
      // Get repo stats
      const statsResponse = await axios.post(
        `${this.config.apiUrl}/api/v0/repo/stat`
      );

      const stats = statsResponse.data;

      // Get pin count
      const pinsResponse = await axios.post(
        `${this.config.apiUrl}/api/v0/pin/ls?type=recursive`
      );

      const pinCount = Object.keys(pinsResponse.data.Keys || {}).length;

      return {
        backend: 'ipfs',
        apiUrl: this.config.apiUrl,
        fileCount: pinCount,
        totalSize: stats.RepoSize,
        maxFileSize: this.config.maxFileSize,
        storageMax: stats.StorageMax,
        healthy: true
      };
    } catch (error) {
      logger.error('Failed to get IPFS stats', { error: error.message });
      return {
        backend: 'ipfs',
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
      const response = await axios.post(`${this.config.apiUrl}/api/v0/version`);

      return {
        healthy: true,
        backend: 'ipfs',
        apiUrl: this.config.apiUrl,
        version: response.data.Version
      };
    } catch (error) {
      logger.error('IPFS health check failed', { error: error.message });

      return {
        healthy: false,
        backend: 'ipfs',
        error: error.message
      };
    }
  }
}

module.exports = IPFSBackend;
