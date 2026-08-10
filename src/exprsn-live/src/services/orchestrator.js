/**
 * Streaming Orchestration Service
 * Coordinates multi-platform streaming with automatic failover and health monitoring
 */

const EventEmitter = require('events');
const logger = require('../utils/logger');
const simulcastService = require('./simulcast');
const encryptionService = require('./encryption');
const youtubeService = require('./platforms/youtube');
const twitchService = require('./platforms/twitch');
const facebookService = require('./platforms/facebook');
const cloudflareService = require('../services/cloudflare');

// Models
const { Stream, StreamDestination } = require('../models');

class StreamOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.healthCheckInterval = null;
    this.healthCheckFrequency = 30000; // 30 seconds

    // Listen to simulcast events
    this._setupEventHandlers();
  }

  /**
   * Setup event handlers for simulcast service
   * @private
   */
  _setupEventHandlers() {
    simulcastService.on('simulcast:started', (data) => {
      this.emit('stream:started', data);
    });

    simulcastService.on('simulcast:ended', (data) => {
      this.emit('stream:ended', data);
    });

    simulcastService.on('destination:error', async (data) => {
      this.emit('destination:error', data);
      await this._handleDestinationError(data);
    });

    simulcastService.on('metrics:update', (data) => {
      this.emit('metrics:update', data);
    });
  }

  /**
   * Initialize streaming orchestrator
   */
  async initialize() {
    logger.info('Initializing streaming orchestrator');

    // Start health check loop
    this._startHealthCheckLoop();

    logger.info('Streaming orchestrator initialized');
  }

  /**
   * Start health check loop
   * @private
   */
  _startHealthCheckLoop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this._performHealthChecks();
    }, this.healthCheckFrequency);
  }

  /**
   * Perform health checks on all active streams
   * @private
   */
  async _performHealthChecks() {
    const activeStreams = simulcastService.getActiveStreams();

    for (const stream of activeStreams) {
      const health = simulcastService.getHealth(stream.streamId);

      if (health && health.overall !== 'healthy') {
        logger.warn('Stream health degraded', {
          streamId: stream.streamId,
          health
        });

        this.emit('health:degraded', {
          streamId: stream.streamId,
          health
        });

        // Check for destinations that need attention
        for (const [destId, destHealth] of Object.entries(health.destinations)) {
          if (destHealth.health === 'stale') {
            // Destination might be disconnected
            await this._handleStaleDestination(stream.streamId, destId);
          }
        }
      }
    }
  }

  /**
   * Setup and start streaming to multiple platforms
   * @param {string} streamId - Stream database ID
   * @param {Object} options - Streaming options
   * @returns {Promise<Object>} Stream status
   */
  async setupAndStartStream(streamId, options = {}) {
    try {
      // Get stream from database
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        throw new Error('Stream not found');
      }

      // Get enabled destinations
      const destinations = await StreamDestination.findAll({
        where: {
          stream_id: streamId,
          is_enabled: true
        }
      });

      if (destinations.length === 0) {
        throw new Error('No enabled streaming destinations');
      }

      logger.info('Setting up stream destinations', {
        streamId,
        destinationCount: destinations.length
      });

      // Prepare destinations for simulcast
      const preparedDestinations = [];

      for (const destination of destinations) {
        try {
          const prepared = await this._prepareDestination(stream, destination);
          preparedDestinations.push(prepared);
        } catch (error) {
          logger.error('Failed to prepare destination', {
            streamId,
            destinationId: destination.id,
            platform: destination.platform,
            error: error.message
          });

          // Update destination status
          await destination.update({
            status: 'error',
            error_message: error.message
          });
        }
      }

      if (preparedDestinations.length === 0) {
        throw new Error('Failed to prepare any destinations');
      }

      // Get input source (RTMP or Cloudflare)
      const inputSource = stream.rtmp_url || options.inputSource;
      if (!inputSource) {
        throw new Error('No input source specified');
      }

      // Start simulcast
      const simulcastInfo = await simulcastService.startSimulcast(
        streamId,
        inputSource,
        preparedDestinations
      );

      // Update stream status
      await stream.update({
        status: 'live',
        started_at: new Date()
      });

      // Update destination statuses
      for (const dest of simulcastInfo.destinations) {
        const dbDest = destinations.find(d => d.id === dest.id);
        if (dbDest) {
          await dbDest.update({
            status: dest.status,
            started_at: new Date(),
            error_message: dest.error || null
          });
        }
      }

      return {
        streamId,
        status: 'live',
        destinations: simulcastInfo.destinations,
        startedAt: simulcastInfo.startedAt
      };
    } catch (error) {
      logger.error('Failed to setup and start stream', {
        streamId,
        error: error.message
      });

      // Update stream status
      await Stream.update(
        { status: 'error' },
        { where: { id: streamId } }
      );

      throw error;
    }
  }

  /**
   * Prepare a destination for streaming
   * @private
   */
  async _prepareDestination(stream, destination) {
    const platform = destination.platform;

    logger.debug('Preparing destination', {
      streamId: stream.id,
      destinationId: destination.id,
      platform
    });

    // Decrypt credentials
    const decryptedData = {
      accessToken: destination.access_token ?
        encryptionService.decrypt(destination.access_token) : null,
      refreshToken: destination.refresh_token ?
        encryptionService.decrypt(destination.refresh_token) : null,
      streamKey: destination.stream_key ?
        encryptionService.decrypt(destination.stream_key) : null
    };

    // Check if tokens need refresh
    if (decryptedData.accessToken && destination.token_expires_at) {
      const expiresAt = new Date(destination.token_expires_at);
      const now = new Date();
      const bufferMs = 5 * 60 * 1000; // 5 minutes

      if (expiresAt.getTime() - bufferMs < now.getTime()) {
        logger.info('Refreshing expired access token', {
          platform,
          destinationId: destination.id
        });

        decryptedData.accessToken = await this._refreshAccessToken(
          platform,
          decryptedData.refreshToken,
          destination
        );
      }
    }

    // Platform-specific preparation
    let rtmpUrl, streamKey;

    switch (platform) {
      case 'youtube':
        ({ rtmpUrl, streamKey } = await this._prepareYouTube(destination, decryptedData));
        break;

      case 'twitch':
        ({ rtmpUrl, streamKey } = await this._prepareTwitch(destination, decryptedData));
        break;

      case 'facebook':
        ({ rtmpUrl, streamKey } = await this._prepareFacebook(destination, decryptedData));
        break;

      case 'cloudflare':
        ({ rtmpUrl, streamKey } = await this._prepareCloudflare(destination, decryptedData));
        break;

      case 'rtmp_custom':
        rtmpUrl = destination.rtmp_url;
        streamKey = decryptedData.streamKey;
        break;

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    return {
      id: destination.id,
      platform,
      rtmpUrl,
      streamKey,
      settings: destination.settings || {}
    };
  }

  /**
   * Prepare YouTube destination
   * @private
   */
  async _prepareYouTube(destination, credentials) {
    if (destination.platform_stream_id && destination.rtmp_url) {
      // Use existing broadcast
      return {
        rtmpUrl: destination.rtmp_url,
        streamKey: credentials.streamKey
      };
    }

    // Create new broadcast
    const broadcast = await youtubeService.createCompleteBroadcast(
      credentials.accessToken,
      {
        title: destination.name,
        description: destination.metadata?.description || '',
        privacyStatus: destination.metadata?.privacy || 'public'
      }
    );

    // Update destination with broadcast info
    await destination.update({
      platform_stream_id: broadcast.broadcast.id,
      rtmp_url: broadcast.rtmpUrl,
      stream_key: encryptionService.encrypt(broadcast.streamKey),
      playback_url: broadcast.watchUrl
    });

    return {
      rtmpUrl: broadcast.rtmpUrl,
      streamKey: broadcast.streamKey
    };
  }

  /**
   * Prepare Twitch destination
   * @private
   */
  async _prepareTwitch(destination, credentials) {
    const rtmpUrls = twitchService.getRTMPUrls();

    // Get stream key if not cached
    let streamKey = credentials.streamKey;

    if (!streamKey && credentials.accessToken) {
      const user = await twitchService.getUser(credentials.accessToken);
      streamKey = await twitchService.getStreamKey(credentials.accessToken, user.id);

      // Cache stream key
      await destination.update({
        stream_key: encryptionService.encrypt(streamKey)
      });
    }

    // Update stream info if specified
    if (destination.metadata?.title) {
      const user = await twitchService.getUser(credentials.accessToken);
      await twitchService.updateStreamInfo(credentials.accessToken, user.id, {
        title: destination.metadata.title,
        gameId: destination.metadata.gameId
      });
    }

    return {
      rtmpUrl: rtmpUrls.primary,
      streamKey
    };
  }

  /**
   * Prepare Facebook destination
   * @private
   */
  async _prepareFacebook(destination, credentials) {
    if (destination.platform_stream_id && destination.rtmp_url) {
      // Use existing live video
      const parsed = facebookService.parseStreamUrl(destination.rtmp_url);
      return {
        rtmpUrl: parsed.rtmpUrl,
        streamKey: parsed.streamKey
      };
    }

    // Create new live video
    const pageAccessToken = credentials.accessToken;
    const pageId = destination.metadata?.pageId;

    if (!pageId) {
      throw new Error('Facebook page ID not configured');
    }

    const liveVideo = await facebookService.createLiveVideo(
      pageAccessToken,
      pageId,
      {
        title: destination.name,
        description: destination.metadata?.description || '',
        status: 'LIVE_NOW'
      }
    );

    const parsed = facebookService.parseStreamUrl(liveVideo.streamUrl);

    // Update destination
    await destination.update({
      platform_stream_id: liveVideo.id,
      rtmp_url: parsed.rtmpUrl,
      stream_key: encryptionService.encrypt(parsed.streamKey),
      playback_url: liveVideo.permalinkUrl
    });

    return {
      rtmpUrl: parsed.rtmpUrl,
      streamKey: parsed.streamKey
    };
  }

  /**
   * Prepare Cloudflare destination
   * @private
   */
  async _prepareCloudflare(destination, credentials) {
    if (destination.platform_stream_id && destination.rtmp_url) {
      // Use existing live input
      return {
        rtmpUrl: destination.rtmp_url,
        streamKey: credentials.streamKey
      };
    }

    // Create new live input
    const liveInput = await cloudflareService.createLiveInput({
      recording: { mode: 'automatic' },
      meta: { name: destination.name }
    });

    // Update destination
    await destination.update({
      platform_stream_id: liveInput.uid,
      rtmp_url: liveInput.rtmpUrl,
      stream_key: encryptionService.encrypt(liveInput.streamKey)
    });

    return {
      rtmpUrl: liveInput.rtmpUrl,
      streamKey: liveInput.streamKey
    };
  }

  /**
   * Refresh access token for a platform
   * @private
   */
  async _refreshAccessToken(platform, refreshToken, destination) {
    try {
      let newTokens;

      switch (platform) {
        case 'youtube':
          newTokens = await youtubeService.refreshAccessToken(refreshToken);
          break;

        case 'twitch':
          newTokens = await twitchService.refreshAccessToken(refreshToken);
          break;

        case 'facebook':
          newTokens = await facebookService.getLongLivedToken(refreshToken);
          break;

        default:
          throw new Error(`Token refresh not supported for ${platform}`);
      }

      // Update destination with new tokens
      const expiresAt = new Date(Date.now() + (newTokens.expiresIn * 1000));

      await destination.update({
        access_token: encryptionService.encrypt(newTokens.accessToken),
        token_expires_at: expiresAt
      });

      logger.info('Access token refreshed', {
        platform,
        destinationId: destination.id
      });

      return newTokens.accessToken;
    } catch (error) {
      logger.error('Failed to refresh access token', {
        platform,
        destinationId: destination.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Stop streaming
   * @param {string} streamId - Stream database ID
   * @returns {Promise<boolean>} Success status
   */
  async stopStream(streamId) {
    try {
      // Stop simulcast
      await simulcastService.stopSimulcast(streamId);

      // Update database
      const stream = await Stream.findByPk(streamId);
      if (stream) {
        await stream.update({
          status: 'ended',
          ended_at: new Date(),
          duration_seconds: Math.floor((new Date() - new Date(stream.started_at)) / 1000)
        });
      }

      // Update destinations
      await StreamDestination.update(
        {
          status: 'disconnected',
          ended_at: new Date()
        },
        {
          where: { stream_id: streamId }
        }
      );

      return true;
    } catch (error) {
      logger.error('Failed to stop stream', { streamId, error: error.message });
      throw error;
    }
  }

  /**
   * Handle destination error
   * @private
   */
  async _handleDestinationError(data) {
    const { streamId, destinationId, error } = data;

    logger.error('Destination error occurred', { streamId, destinationId, error });

    // Update destination in database
    await StreamDestination.update(
      {
        status: 'error',
        error_message: error,
        retry_count: sequelize.literal('retry_count + 1'),
        last_retry_at: new Date()
      },
      {
        where: { id: destinationId }
      }
    );

    // Check if we should retry
    const destination = await StreamDestination.findByPk(destinationId);

    if (destination && destination.settings.auto_reconnect) {
      const maxRetries = destination.settings.max_retries || 3;

      if (destination.retry_count < maxRetries) {
        logger.info('Attempting to reconnect destination', {
          streamId,
          destinationId,
          attempt: destination.retry_count + 1,
          maxRetries
        });

        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, destination.retry_count), 30000);
        setTimeout(async () => {
          await this._retryDestination(streamId, destination);
        }, delay);
      } else {
        logger.warn('Max retries reached for destination', {
          streamId,
          destinationId,
          retries: destination.retry_count
        });
      }
    }
  }

  /**
   * Handle stale destination (no updates)
   * @private
   */
  async _handleStaleDestination(streamId, destinationId) {
    logger.warn('Destination is stale', { streamId, destinationId });

    // Could implement automatic reconnection here if desired
    this.emit('destination:stale', { streamId, destinationId });
  }

  /**
   * Retry failed destination
   * @private
   */
  async _retryDestination(streamId, destination) {
    try {
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        throw new Error('Stream not found');
      }

      const prepared = await this._prepareDestination(stream, destination);

      // Add destination to active simulcast
      await simulcastService.addDestination(streamId, prepared);

      // Update destination status
      await destination.update({
        status: 'connecting',
        last_retry_at: new Date()
      });

      logger.info('Destination reconnection initiated', {
        streamId,
        destinationId: destination.id
      });
    } catch (error) {
      logger.error('Failed to retry destination', {
        streamId,
        destinationId: destination.id,
        error: error.message
      });

      await destination.update({
        status: 'error',
        error_message: `Retry failed: ${error.message}`
      });
    }
  }

  /**
   * Get comprehensive stream status
   * @param {string} streamId - Stream database ID
   * @returns {Promise<Object>} Complete stream status
   */
  async getStreamStatus(streamId) {
    const stream = await Stream.findByPk(streamId);
    if (!stream) {
      return null;
    }

    const destinations = await StreamDestination.findAll({
      where: { stream_id: streamId }
    });

    const simulcastStatus = simulcastService.getStatus(streamId);
    const metrics = simulcastService.getMetrics(streamId);
    const health = simulcastService.getHealth(streamId);

    return {
      stream: {
        id: stream.id,
        title: stream.title,
        status: stream.status,
        started_at: stream.started_at,
        ended_at: stream.ended_at,
        viewer_count: stream.viewer_count
      },
      destinations: destinations.map(d => ({
        id: d.id,
        platform: d.platform,
        name: d.name,
        status: d.status,
        viewer_count: d.viewer_count,
        error_message: d.error_message,
        retry_count: d.retry_count,
        playback_url: d.playback_url
      })),
      simulcast: simulcastStatus,
      metrics,
      health
    };
  }

  /**
   * Shutdown orchestrator
   */
  async shutdown() {
    logger.info('Shutting down streaming orchestrator');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Stop all active streams
    const activeStreams = simulcastService.getActiveStreams();
    for (const stream of activeStreams) {
      try {
        await this.stopStream(stream.streamId);
      } catch (error) {
        logger.error('Error stopping stream during shutdown', {
          streamId: stream.streamId,
          error: error.message
        });
      }
    }

    logger.info('Streaming orchestrator shutdown complete');
  }
}

// Export singleton instance
module.exports = new StreamOrchestrator();
