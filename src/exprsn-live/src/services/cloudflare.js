/**
 * Cloudflare Stream API Service
 * Handles live streaming and video storage via Cloudflare Stream
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class CloudflareStreamService {
  constructor() {
    this.accountId = config.streaming.cloudflare.accountId;
    this.apiToken = config.streaming.cloudflare.apiToken;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/stream`;

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Create a new live stream input
   * @param {Object} options - Stream options
   * @returns {Promise<Object>} Stream data with RTMP URLs
   */
  async createLiveInput(options = {}) {
    try {
      const {
        recording = {
          mode: 'automatic',
          timeoutSeconds: 0,
          requireSignedURLs: false
        },
        meta = {}
      } = options;

      const response = await this.client.post('/live_inputs', {
        recording,
        meta
      });

      const data = response.data.result;

      logger.info('Created Cloudflare live input', {
        uid: data.uid
      });

      return {
        uid: data.uid,
        rtmpUrl: data.rtmps.url,
        rtmpsUrl: data.rtmps.url,
        streamKey: data.rtmps.streamKey,
        webRTCUrl: data.webRTC?.url || null,
        status: data.status,
        created: data.created
      };
    } catch (error) {
      logger.error('Failed to create Cloudflare live input:', error.response?.data || error.message);
      throw new Error('Failed to create live stream input');
    }
  }

  /**
   * Get live input details
   * @param {string} liveInputId - Cloudflare live input UID
   * @returns {Promise<Object>} Live input data
   */
  async getLiveInput(liveInputId) {
    try {
      const response = await this.client.get(`/live_inputs/${liveInputId}`);
      const data = response.data.result;

      return {
        uid: data.uid,
        rtmpUrl: data.rtmps.url,
        rtmpsUrl: data.rtmps.url,
        streamKey: data.rtmps.streamKey,
        status: data.status,
        recording: data.recording,
        meta: data.meta
      };
    } catch (error) {
      logger.error('Failed to get Cloudflare live input:', error.response?.data || error.message);
      throw new Error('Failed to get live input details');
    }
  }

  /**
   * Update live input
   * @param {string} liveInputId - Cloudflare live input UID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated live input data
   */
  async updateLiveInput(liveInputId, updates) {
    try {
      const response = await this.client.patch(`/live_inputs/${liveInputId}`, updates);
      return response.data.result;
    } catch (error) {
      logger.error('Failed to update Cloudflare live input:', error.response?.data || error.message);
      throw new Error('Failed to update live input');
    }
  }

  /**
   * Delete live input
   * @param {string} liveInputId - Cloudflare live input UID
   * @returns {Promise<boolean>} Success status
   */
  async deleteLiveInput(liveInputId) {
    try {
      await this.client.delete(`/live_inputs/${liveInputId}`);
      logger.info('Deleted Cloudflare live input', { uid: liveInputId });
      return true;
    } catch (error) {
      logger.error('Failed to delete Cloudflare live input:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * List all live inputs
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of live inputs
   */
  async listLiveInputs(options = {}) {
    try {
      const { include_counts = false } = options;
      const response = await this.client.get('/live_inputs', {
        params: { include_counts }
      });
      return response.data.result;
    } catch (error) {
      logger.error('Failed to list Cloudflare live inputs:', error.response?.data || error.message);
      throw new Error('Failed to list live inputs');
    }
  }

  /**
   * Get recordings for a live input
   * @param {string} liveInputId - Cloudflare live input UID
   * @returns {Promise<Array>} List of recordings
   */
  async getLiveInputRecordings(liveInputId) {
    try {
      const response = await this.client.get(`/live_inputs/${liveInputId}/videos`);
      return response.data.result.map(video => ({
        uid: video.uid,
        status: video.status,
        thumbnail: video.thumbnail,
        playback: video.playback,
        duration: video.duration,
        created: video.created,
        modified: video.modified,
        meta: video.meta
      }));
    } catch (error) {
      logger.error('Failed to get live input recordings:', error.response?.data || error.message);
      throw new Error('Failed to get recordings');
    }
  }

  /**
   * Upload video for recording
   * @param {Buffer|Stream} videoData - Video file data
   * @param {Object} metadata - Video metadata
   * @returns {Promise<Object>} Upload result
   */
  async uploadVideo(videoData, metadata = {}) {
    try {
      const formData = new FormData();
      formData.append('file', videoData);

      if (metadata.name) formData.append('meta[name]', metadata.name);
      if (metadata.requireSignedURLs !== undefined) {
        formData.append('requireSignedURLs', metadata.requireSignedURLs);
      }

      const response = await axios.post(`${this.baseUrl}/direct_upload`, formData, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          ...formData.getHeaders()
        }
      });

      return response.data.result;
    } catch (error) {
      logger.error('Failed to upload video to Cloudflare:', error.response?.data || error.message);
      throw new Error('Failed to upload video');
    }
  }

  /**
   * Get video details
   * @param {string} videoId - Cloudflare video UID
   * @returns {Promise<Object>} Video details
   */
  async getVideo(videoId) {
    try {
      const response = await this.client.get(`/${videoId}`);
      const video = response.data.result;

      return {
        uid: video.uid,
        status: video.status,
        thumbnail: video.thumbnail,
        playback: {
          hls: video.playback?.hls,
          dash: video.playback?.dash
        },
        duration: video.duration,
        size: video.size,
        preview: video.preview,
        created: video.created,
        modified: video.modified,
        meta: video.meta
      };
    } catch (error) {
      logger.error('Failed to get video from Cloudflare:', error.response?.data || error.message);
      throw new Error('Failed to get video details');
    }
  }

  /**
   * Delete video
   * @param {string} videoId - Cloudflare video UID
   * @returns {Promise<boolean>} Success status
   */
  async deleteVideo(videoId) {
    try {
      await this.client.delete(`/${videoId}`);
      logger.info('Deleted Cloudflare video', { uid: videoId });
      return true;
    } catch (error) {
      logger.error('Failed to delete video from Cloudflare:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Get video analytics
   * @param {string} videoId - Cloudflare video UID
   * @returns {Promise<Object>} Video analytics
   */
  async getVideoAnalytics(videoId) {
    try {
      const response = await this.client.get(`/${videoId}/analytics`);
      return response.data.result;
    } catch (error) {
      logger.error('Failed to get video analytics:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Generate signed URL for private video playback
   * @param {string} videoId - Cloudflare video UID
   * @param {number} expiresIn - Expiration time in seconds
   * @returns {Promise<string>} Signed URL
   */
  async generateSignedUrl(videoId, expiresIn = 3600) {
    try {
      const response = await this.client.post(`/${videoId}/token`, {
        exp: Math.floor(Date.now() / 1000) + expiresIn
      });
      return response.data.result.token;
    } catch (error) {
      logger.error('Failed to generate signed URL:', error.response?.data || error.message);
      throw new Error('Failed to generate signed URL');
    }
  }
}

// Export singleton instance
module.exports = new CloudflareStreamService();
