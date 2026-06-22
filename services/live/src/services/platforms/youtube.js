/**
 * YouTube Live Streaming Service
 * Integration with YouTube Data API v3 and YouTube Live Streaming API
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const config = require('../../config');

class YouTubeStreamService {
  constructor() {
    this.apiBaseUrl = 'https://www.googleapis.com/youtube/v3';
    this.oauthUrl = 'https://oauth2.googleapis.com/token';
    this.clientId = config.platforms?.youtube?.clientId;
    this.clientSecret = config.platforms?.youtube?.clientSecret;
    this.redirectUri = config.platforms?.youtube?.redirectUri;
  }

  /**
   * Generate OAuth2 authorization URL
   * @param {string} state - State parameter for CSRF protection
   * @returns {string} Authorization URL
   */
  getAuthorizationUrl(state) {
    const scopes = [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.readonly'
    ];

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      state,
      prompt: 'consent'
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code
   * @returns {Promise<Object>} Token data
   */
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.post(this.oauthUrl, {
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code'
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type
      };
    } catch (error) {
      logger.error('Failed to exchange code for token:', error.response?.data || error.message);
      throw new Error('Failed to obtain YouTube access token');
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New token data
   */
  async refreshAccessToken(refreshToken) {
    try {
      const response = await axios.post(this.oauthUrl, {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      });

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type
      };
    } catch (error) {
      logger.error('Failed to refresh access token:', error.response?.data || error.message);
      throw new Error('Failed to refresh YouTube access token');
    }
  }

  /**
   * Create API client with access token
   */
  createClient(accessToken) {
    return axios.create({
      baseURL: this.apiBaseUrl,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Create a live broadcast
   * @param {string} accessToken - YouTube access token
   * @param {Object} broadcastData - Broadcast configuration
   * @returns {Promise<Object>} Broadcast details
   */
  async createBroadcast(accessToken, broadcastData) {
    try {
      const client = this.createClient(accessToken);

      const {
        title,
        description,
        scheduledStartTime,
        privacyStatus = 'public',
        enableAutoStart = true,
        enableDvr = true,
        enableContentEncryption = false,
        enableEmbed = true,
        recordFromStart = true
      } = broadcastData;

      const response = await client.post('/liveBroadcasts', {
        part: 'snippet,status,contentDetails',
        snippet: {
          title,
          description,
          scheduledStartTime: scheduledStartTime || new Date().toISOString()
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false
        },
        contentDetails: {
          enableAutoStart,
          enableDvr,
          enableContentEncryption,
          enableEmbed,
          recordFromStart,
          latencyPreference: 'low'
        }
      });

      const broadcast = response.data;

      logger.info('YouTube broadcast created', {
        id: broadcast.id,
        title: broadcast.snippet.title
      });

      return {
        id: broadcast.id,
        title: broadcast.snippet.title,
        description: broadcast.snippet.description,
        scheduledStartTime: broadcast.snippet.scheduledStartTime,
        actualStartTime: broadcast.snippet.actualStartTime,
        actualEndTime: broadcast.snippet.actualEndTime,
        privacyStatus: broadcast.status.privacyStatus,
        lifeCycleStatus: broadcast.status.lifeCycleStatus,
        watchUrl: `https://www.youtube.com/watch?v=${broadcast.id}`
      };
    } catch (error) {
      logger.error('Failed to create YouTube broadcast:', error.response?.data || error.message);
      throw new Error('Failed to create YouTube broadcast');
    }
  }

  /**
   * Create a live stream
   * @param {string} accessToken - YouTube access token
   * @param {Object} streamData - Stream configuration
   * @returns {Promise<Object>} Stream details including RTMP URL
   */
  async createStream(accessToken, streamData) {
    try {
      const client = this.createClient(accessToken);

      const {
        title,
        resolution = '1080p',
        frameRate = '30fps',
        ingestionType = 'rtmp'
      } = streamData;

      const response = await client.post('/liveStreams', {
        part: 'snippet,cdn,contentDetails,status',
        snippet: {
          title
        },
        cdn: {
          frameRate,
          ingestionType,
          resolution
        },
        contentDetails: {
          isReusable: false
        }
      });

      const stream = response.data;

      logger.info('YouTube stream created', {
        id: stream.id,
        title: stream.snippet.title
      });

      return {
        id: stream.id,
        title: stream.snippet.title,
        rtmpUrl: stream.cdn.ingestionInfo.ingestionAddress,
        streamKey: stream.cdn.ingestionInfo.streamName,
        backupRtmpUrl: stream.cdn.ingestionInfo.backupIngestionAddress,
        resolution: stream.cdn.resolution,
        frameRate: stream.cdn.frameRate
      };
    } catch (error) {
      logger.error('Failed to create YouTube stream:', error.response?.data || error.message);
      throw new Error('Failed to create YouTube stream');
    }
  }

  /**
   * Bind broadcast to stream
   * @param {string} accessToken - YouTube access token
   * @param {string} broadcastId - Broadcast ID
   * @param {string} streamId - Stream ID
   * @returns {Promise<Object>} Binding result
   */
  async bindBroadcastToStream(accessToken, broadcastId, streamId) {
    try {
      const client = this.createClient(accessToken);

      const response = await client.post('/liveBroadcasts/bind', null, {
        params: {
          part: 'id,snippet,status',
          id: broadcastId,
          streamId
        }
      });

      logger.info('Broadcast bound to stream', { broadcastId, streamId });

      return response.data;
    } catch (error) {
      logger.error('Failed to bind broadcast to stream:', error.response?.data || error.message);
      throw new Error('Failed to bind broadcast to stream');
    }
  }

  /**
   * Start a broadcast
   * @param {string} accessToken - YouTube access token
   * @param {string} broadcastId - Broadcast ID
   * @returns {Promise<Object>} Updated broadcast
   */
  async startBroadcast(accessToken, broadcastId) {
    try {
      const client = this.createClient(accessToken);

      const response = await client.post('/liveBroadcasts/transition', null, {
        params: {
          part: 'status',
          broadcastStatus: 'live',
          id: broadcastId
        }
      });

      logger.info('YouTube broadcast started', { broadcastId });

      return response.data;
    } catch (error) {
      logger.error('Failed to start YouTube broadcast:', error.response?.data || error.message);
      throw new Error('Failed to start YouTube broadcast');
    }
  }

  /**
   * End a broadcast
   * @param {string} accessToken - YouTube access token
   * @param {string} broadcastId - Broadcast ID
   * @returns {Promise<Object>} Updated broadcast
   */
  async endBroadcast(accessToken, broadcastId) {
    try {
      const client = this.createClient(accessToken);

      const response = await client.post('/liveBroadcasts/transition', null, {
        params: {
          part: 'status',
          broadcastStatus: 'complete',
          id: broadcastId
        }
      });

      logger.info('YouTube broadcast ended', { broadcastId });

      return response.data;
    } catch (error) {
      logger.error('Failed to end YouTube broadcast:', error.response?.data || error.message);
      throw new Error('Failed to end YouTube broadcast');
    }
  }

  /**
   * Get broadcast details
   * @param {string} accessToken - YouTube access token
   * @param {string} broadcastId - Broadcast ID
   * @returns {Promise<Object>} Broadcast details
   */
  async getBroadcast(accessToken, broadcastId) {
    try {
      const client = this.createClient(accessToken);

      const response = await client.get('/liveBroadcasts', {
        params: {
          part: 'id,snippet,status,contentDetails,statistics',
          id: broadcastId
        }
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error('Broadcast not found');
      }

      const broadcast = response.data.items[0];

      return {
        id: broadcast.id,
        title: broadcast.snippet.title,
        description: broadcast.snippet.description,
        scheduledStartTime: broadcast.snippet.scheduledStartTime,
        actualStartTime: broadcast.snippet.actualStartTime,
        actualEndTime: broadcast.snippet.actualEndTime,
        privacyStatus: broadcast.status.privacyStatus,
        lifeCycleStatus: broadcast.status.lifeCycleStatus,
        viewCount: broadcast.statistics?.concurrentViewers || 0,
        totalViewCount: broadcast.statistics?.totalChatCount || 0
      };
    } catch (error) {
      logger.error('Failed to get YouTube broadcast:', error.response?.data || error.message);
      throw new Error('Failed to get YouTube broadcast');
    }
  }

  /**
   * Delete a broadcast
   * @param {string} accessToken - YouTube access token
   * @param {string} broadcastId - Broadcast ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteBroadcast(accessToken, broadcastId) {
    try {
      const client = this.createClient(accessToken);

      await client.delete('/liveBroadcasts', {
        params: { id: broadcastId }
      });

      logger.info('YouTube broadcast deleted', { broadcastId });

      return true;
    } catch (error) {
      logger.error('Failed to delete YouTube broadcast:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Get stream health
   * @param {string} accessToken - YouTube access token
   * @param {string} streamId - Stream ID
   * @returns {Promise<Object>} Stream health metrics
   */
  async getStreamHealth(accessToken, streamId) {
    try {
      const client = this.createClient(accessToken);

      const response = await client.get('/liveStreams', {
        params: {
          part: 'status,cdn',
          id: streamId
        }
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error('Stream not found');
      }

      const stream = response.data.items[0];

      return {
        status: stream.status.streamStatus,
        healthStatus: stream.status.healthStatus,
        configurationIssues: stream.cdn.ingestionInfo?.configurationIssues || []
      };
    } catch (error) {
      logger.error('Failed to get stream health:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Create complete live broadcast (broadcast + stream + bind)
   * @param {string} accessToken - YouTube access token
   * @param {Object} options - Broadcast options
   * @returns {Promise<Object>} Complete broadcast details
   */
  async createCompleteBroadcast(accessToken, options) {
    try {
      // Create broadcast
      const broadcast = await this.createBroadcast(accessToken, options);

      // Create stream
      const stream = await this.createStream(accessToken, {
        title: `${options.title} - Stream`,
        resolution: options.resolution,
        frameRate: options.frameRate
      });

      // Bind broadcast to stream
      await this.bindBroadcastToStream(accessToken, broadcast.id, stream.id);

      return {
        broadcast,
        stream,
        rtmpUrl: stream.rtmpUrl,
        streamKey: stream.streamKey,
        watchUrl: broadcast.watchUrl
      };
    } catch (error) {
      logger.error('Failed to create complete YouTube broadcast:', error);
      throw error;
    }
  }
}

module.exports = new YouTubeStreamService();
