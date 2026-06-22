/**
 * Twitch Streaming Service
 * Integration with Twitch API for live streaming
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const config = require('../../config');

class TwitchStreamService {
  constructor() {
    this.apiBaseUrl = 'https://api.twitch.tv/helix';
    this.oauthUrl = 'https://id.twitch.tv/oauth2/token';
    this.clientId = config.platforms?.twitch?.clientId;
    this.clientSecret = config.platforms?.twitch?.clientSecret;
    this.redirectUri = config.platforms?.twitch?.redirectUri;
  }

  /**
   * Generate OAuth2 authorization URL
   * @param {string} state - State parameter for CSRF protection
   * @returns {string} Authorization URL
   */
  getAuthorizationUrl(state) {
    const scopes = [
      'channel:manage:broadcast',
      'channel:read:stream_key',
      'user:read:broadcast',
      'channel:manage:videos'
    ];

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state
    });

    return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code
   * @returns {Promise<Object>} Token data
   */
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.post(this.oauthUrl, null, {
        params: {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri
        }
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type
      };
    } catch (error) {
      logger.error('Failed to exchange code for token:', error.response?.data || error.message);
      throw new Error('Failed to obtain Twitch access token');
    }
  }

  /**
   * Refresh access token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New token data
   */
  async refreshAccessToken(refreshToken) {
    try {
      const response = await axios.post(this.oauthUrl, null, {
        params: {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      logger.error('Failed to refresh access token:', error.response?.data || error.message);
      throw new Error('Failed to refresh Twitch access token');
    }
  }

  /**
   * Create API client
   */
  createClient(accessToken) {
    return axios.create({
      baseURL: this.apiBaseUrl,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Client-Id': this.clientId,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Get user information
   * @param {string} accessToken - Access token
   * @returns {Promise<Object>} User data
   */
  async getUser(accessToken) {
    try {
      const client = this.createClient(accessToken);
      const response = await client.get('/users');

      const user = response.data.data[0];

      return {
        id: user.id,
        login: user.login,
        displayName: user.display_name,
        type: user.type,
        broadcasterType: user.broadcaster_type,
        description: user.description,
        profileImageUrl: user.profile_image_url,
        offlineImageUrl: user.offline_image_url,
        viewCount: user.view_count,
        email: user.email,
        createdAt: user.created_at
      };
    } catch (error) {
      logger.error('Failed to get Twitch user:', error.response?.data || error.message);
      throw new Error('Failed to get Twitch user information');
    }
  }

  /**
   * Get stream key
   * @param {string} accessToken - Access token
   * @param {string} broadcasterId - Broadcaster user ID
   * @returns {Promise<string>} Stream key
   */
  async getStreamKey(accessToken, broadcasterId) {
    try {
      const client = this.createClient(accessToken);
      const response = await client.get('/streams/key', {
        params: { broadcaster_id: broadcasterId }
      });

      return response.data.data[0].stream_key;
    } catch (error) {
      logger.error('Failed to get stream key:', error.response?.data || error.message);
      throw new Error('Failed to get Twitch stream key');
    }
  }

  /**
   * Get stream information
   * @param {string} accessToken - Access token
   * @param {string} broadcasterId - Broadcaster user ID
   * @returns {Promise<Object|null>} Stream data
   */
  async getStream(accessToken, broadcasterId) {
    try {
      const client = this.createClient(accessToken);
      const response = await client.get('/streams', {
        params: { user_id: broadcasterId }
      });

      if (!response.data.data || response.data.data.length === 0) {
        return null; // Stream is offline
      }

      const stream = response.data.data[0];

      return {
        id: stream.id,
        userId: stream.user_id,
        userLogin: stream.user_login,
        userName: stream.user_name,
        gameId: stream.game_id,
        gameName: stream.game_name,
        type: stream.type,
        title: stream.title,
        viewerCount: stream.viewer_count,
        startedAt: stream.started_at,
        language: stream.language,
        thumbnailUrl: stream.thumbnail_url,
        tagIds: stream.tag_ids,
        isMature: stream.is_mature
      };
    } catch (error) {
      logger.error('Failed to get stream info:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Update stream information
   * @param {string} accessToken - Access token
   * @param {string} broadcasterId - Broadcaster user ID
   * @param {Object} streamInfo - Stream information to update
   * @returns {Promise<boolean>} Success status
   */
  async updateStreamInfo(accessToken, broadcasterId, streamInfo) {
    try {
      const client = this.createClient(accessToken);

      const body = {};
      if (streamInfo.title) body.title = streamInfo.title;
      if (streamInfo.gameId) body.game_id = streamInfo.gameId;
      if (streamInfo.broadcasterLanguage) body.broadcaster_language = streamInfo.broadcasterLanguage;

      await client.patch('/channels', body, {
        params: { broadcaster_id: broadcasterId }
      });

      logger.info('Twitch stream info updated', { broadcasterId });
      return true;
    } catch (error) {
      logger.error('Failed to update stream info:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Get RTMP ingest server
   * @returns {Object} RTMP URLs
   */
  getRTMPUrls() {
    // Twitch ingest endpoints (use closest server for best performance)
    // List of ingest servers: https://stream.twitch.tv/ingests/
    return {
      primary: 'rtmp://live.twitch.tv/app',
      // Common backup servers
      backup: [
        'rtmp://live-sjc.twitch.tv/app',
        'rtmp://live-lax.twitch.tv/app',
        'rtmp://live-iad.twitch.tv/app'
      ]
    };
  }

  /**
   * Create stream configuration
   * @param {string} streamKey - Stream key from Twitch
   * @returns {Object} Stream configuration
   */
  createStreamConfig(streamKey) {
    const rtmpUrls = this.getRTMPUrls();

    return {
      rtmpUrl: rtmpUrls.primary,
      streamKey,
      backupUrls: rtmpUrls.backup,
      settings: {
        // Recommended Twitch settings
        videoBitrate: '4500k',
        audioBitrate: '160k',
        resolution: '1920x1080',
        framerate: 30,
        keyframeInterval: 2,
        preset: 'veryfast',
        profile: 'main'
      }
    };
  }

  /**
   * Get channel information
   * @param {string} accessToken - Access token
   * @param {string} broadcasterId - Broadcaster user ID
   * @returns {Promise<Object>} Channel data
   */
  async getChannel(accessToken, broadcasterId) {
    try {
      const client = this.createClient(accessToken);
      const response = await client.get('/channels', {
        params: { broadcaster_id: broadcasterId }
      });

      const channel = response.data.data[0];

      return {
        broadcasterId: channel.broadcaster_id,
        broadcasterLogin: channel.broadcaster_login,
        broadcasterName: channel.broadcaster_name,
        broadcasterLanguage: channel.broadcaster_language,
        gameId: channel.game_id,
        gameName: channel.game_name,
        title: channel.title,
        delay: channel.delay
      };
    } catch (error) {
      logger.error('Failed to get channel info:', error.response?.data || error.message);
      throw new Error('Failed to get Twitch channel information');
    }
  }
}

module.exports = new TwitchStreamService();
