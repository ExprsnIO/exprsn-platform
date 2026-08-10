/**
 * Generic RTMP Streaming Service
 * Support for custom RTMP destinations
 */

const logger = require('../../utils/logger');
const crypto = require('crypto');

class RTMPStreamService {
  constructor() {
    this.activeStreams = new Map();
  }

  /**
   * Validate RTMP URL format
   * @param {string} url - RTMP URL to validate
   * @returns {boolean} Whether URL is valid
   */
  validateRTMPUrl(url) {
    const rtmpRegex = /^rtmps?:\/\/.+/;
    return rtmpRegex.test(url);
  }

  /**
   * Parse RTMP URL
   * @param {string} fullUrl - Full RTMP URL with stream key
   * @returns {Object} Parsed components
   */
  parseRTMPUrl(fullUrl) {
    try {
      // Handle format: rtmp://server/app/streamkey
      const match = fullUrl.match(/^(rtmps?:\/\/[^\/]+)\/([^\/]+)\/(.+)$/);

      if (match) {
        return {
          server: match[1],
          app: match[2],
          streamKey: match[3],
          fullUrl
        };
      }

      // Handle format: rtmp://server/app (no stream key)
      const match2 = fullUrl.match(/^(rtmps?:\/\/[^\/]+)\/(.+)$/);

      if (match2) {
        return {
          server: match2[1],
          app: match2[2],
          streamKey: null,
          fullUrl
        };
      }

      // Return as-is if can't parse
      return {
        server: fullUrl,
        app: null,
        streamKey: null,
        fullUrl
      };
    } catch (error) {
      logger.error('Failed to parse RTMP URL:', error.message);
      return null;
    }
  }

  /**
   * Create RTMP destination configuration
   * @param {Object} config - Destination configuration
   * @returns {Object} RTMP destination config
   */
  createDestination(config) {
    const {
      name,
      rtmpUrl,
      streamKey = null,
      username = null,
      password = null,
      videoBitrate = '2500k',
      audioBitrate = '128k',
      resolution = '1920x1080',
      framerate = 30,
      preset = 'veryfast',
      enableAuth = false
    } = config;

    // Generate unique ID for this destination
    const id = crypto.randomBytes(16).toString('hex');

    const destination = {
      id,
      name,
      rtmpUrl,
      streamKey,
      settings: {
        videoBitrate,
        audioBitrate,
        resolution,
        framerate,
        preset
      }
    };

    // Add authentication if enabled
    if (enableAuth && username && password) {
      destination.auth = {
        username,
        password
      };
    }

    logger.info('RTMP destination created', {
      id,
      name,
      rtmpUrl: this.maskUrl(rtmpUrl)
    });

    return destination;
  }

  /**
   * Mask sensitive parts of URL for logging
   * @param {string} url - URL to mask
   * @returns {string} Masked URL
   */
  maskUrl(url) {
    try {
      const parsed = this.parseRTMPUrl(url);
      if (parsed && parsed.streamKey) {
        return `${parsed.server}/${parsed.app}/****`;
      }
      return url.replace(/\/[^\/]+$/, '/****');
    } catch (error) {
      return 'rtmp://***';
    }
  }

  /**
   * Build full RTMP URL with stream key
   * @param {string} serverUrl - RTMP server URL
   * @param {string} app - Application name
   * @param {string} streamKey - Stream key
   * @returns {string} Full RTMP URL
   */
  buildRTMPUrl(serverUrl, app, streamKey) {
    const server = serverUrl.replace(/\/$/, '');
    return `${server}/${app}/${streamKey}`;
  }

  /**
   * Validate stream configuration
   * @param {Object} config - Stream configuration
   * @returns {Object} Validation result
   */
  validateStreamConfig(config) {
    const errors = [];

    if (!config.rtmpUrl) {
      errors.push('RTMP URL is required');
    } else if (!this.validateRTMPUrl(config.rtmpUrl)) {
      errors.push('Invalid RTMP URL format');
    }

    if (!config.name) {
      errors.push('Destination name is required');
    }

    // Validate video settings
    if (config.videoBitrate) {
      const bitrateMatch = config.videoBitrate.match(/^(\d+)k?$/);
      if (!bitrateMatch) {
        errors.push('Invalid video bitrate format (use format like "2500k")');
      }
    }

    if (config.resolution) {
      const resolutionMatch = config.resolution.match(/^(\d+)x(\d+)$/);
      if (!resolutionMatch) {
        errors.push('Invalid resolution format (use format like "1920x1080")');
      }
    }

    if (config.framerate && (config.framerate < 1 || config.framerate > 60)) {
      errors.push('Framerate must be between 1 and 60');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get recommended settings for common platforms
   * @param {string} platform - Platform name
   * @returns {Object} Recommended settings
   */
  getRecommendedSettings(platform) {
    const presets = {
      youtube: {
        videoBitrate: '4500k',
        audioBitrate: '128k',
        resolution: '1920x1080',
        framerate: 30,
        preset: 'veryfast',
        keyframeInterval: 2
      },
      twitch: {
        videoBitrate: '4500k',
        audioBitrate: '160k',
        resolution: '1920x1080',
        framerate: 30,
        preset: 'veryfast',
        keyframeInterval: 2
      },
      facebook: {
        videoBitrate: '4000k',
        audioBitrate: '128k',
        resolution: '1280x720',
        framerate: 30,
        preset: 'veryfast',
        keyframeInterval: 2
      },
      default: {
        videoBitrate: '2500k',
        audioBitrate: '128k',
        resolution: '1280x720',
        framerate: 30,
        preset: 'veryfast',
        keyframeInterval: 2
      }
    };

    return presets[platform] || presets.default;
  }

  /**
   * Track active stream
   * @param {string} destinationId - Destination ID
   * @param {Object} streamInfo - Stream information
   */
  trackStream(destinationId, streamInfo) {
    this.activeStreams.set(destinationId, {
      ...streamInfo,
      startedAt: new Date()
    });

    logger.info('Stream tracked', {
      destinationId,
      rtmpUrl: this.maskUrl(streamInfo.rtmpUrl)
    });
  }

  /**
   * Untrack stream
   * @param {string} destinationId - Destination ID
   */
  untrackStream(destinationId) {
    const stream = this.activeStreams.get(destinationId);

    if (stream) {
      const duration = Math.floor((Date.now() - stream.startedAt.getTime()) / 1000);

      logger.info('Stream untracked', {
        destinationId,
        duration
      });

      this.activeStreams.delete(destinationId);
    }
  }

  /**
   * Get active stream info
   * @param {string} destinationId - Destination ID
   * @returns {Object|null} Stream info
   */
  getStreamInfo(destinationId) {
    return this.activeStreams.get(destinationId) || null;
  }

  /**
   * Get all active streams
   * @returns {Array} List of active streams
   */
  getAllActiveStreams() {
    return Array.from(this.activeStreams.entries()).map(([id, info]) => ({
      destinationId: id,
      ...info,
      duration: Math.floor((Date.now() - info.startedAt.getTime()) / 1000)
    }));
  }

  /**
   * Test RTMP connection (basic validation)
   * @param {string} rtmpUrl - RTMP URL to test
   * @returns {Promise<Object>} Test result
   */
  async testConnection(rtmpUrl) {
    // Note: Actual connection testing would require spawning ffmpeg
    // This provides basic validation
    const parsed = this.parseRTMPUrl(rtmpUrl);

    if (!parsed) {
      return {
        success: false,
        message: 'Invalid RTMP URL format'
      };
    }

    return {
      success: true,
      message: 'RTMP URL format is valid',
      details: {
        server: parsed.server,
        app: parsed.app,
        hasStreamKey: !!parsed.streamKey
      }
    };
  }
}

module.exports = new RTMPStreamService();
