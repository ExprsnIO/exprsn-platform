/**
 * Facebook Live Streaming Service
 * Integration with Facebook Graph API for live streaming
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const config = require('../../config');

class FacebookStreamService {
  constructor() {
    this.apiBaseUrl = 'https://graph.facebook.com/v18.0';
    this.oauthUrl = 'https://www.facebook.com/v18.0/dialog/oauth';
    this.tokenUrl = 'https://graph.facebook.com/v18.0/oauth/access_token';
    this.appId = config.platforms?.facebook?.appId;
    this.appSecret = config.platforms?.facebook?.appSecret;
    this.redirectUri = config.platforms?.facebook?.redirectUri;
  }

  /**
   * Generate OAuth2 authorization URL
   * @param {string} state - State parameter for CSRF protection
   * @returns {string} Authorization URL
   */
  getAuthorizationUrl(state) {
    const scopes = [
      'pages_manage_posts',
      'pages_read_engagement',
      'pages_show_list',
      'publish_video'
    ];

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      state,
      scope: scopes.join(','),
      response_type: 'code'
    });

    return `${this.oauthUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code
   * @returns {Promise<Object>} Token data
   */
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.get(this.tokenUrl, {
        params: {
          client_id: this.appId,
          client_secret: this.appSecret,
          redirect_uri: this.redirectUri,
          code
        }
      });

      return {
        accessToken: response.data.access_token,
        tokenType: response.data.token_type,
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      logger.error('Failed to exchange code for token:', error.response?.data || error.message);
      throw new Error('Failed to obtain Facebook access token');
    }
  }

  /**
   * Get long-lived user access token
   * @param {string} shortLivedToken - Short-lived access token
   * @returns {Promise<Object>} Long-lived token data
   */
  async getLongLivedToken(shortLivedToken) {
    try {
      const response = await axios.get(this.tokenUrl, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.appId,
          client_secret: this.appSecret,
          fb_exchange_token: shortLivedToken
        }
      });

      return {
        accessToken: response.data.access_token,
        tokenType: response.data.token_type,
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      logger.error('Failed to get long-lived token:', error.response?.data || error.message);
      throw new Error('Failed to get long-lived Facebook token');
    }
  }

  /**
   * Get user's Facebook pages
   * @param {string} accessToken - User access token
   * @returns {Promise<Array>} List of pages
   */
  async getUserPages(accessToken) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/me/accounts`, {
        params: {
          access_token: accessToken,
          fields: 'id,name,access_token,category,picture'
        }
      });

      return response.data.data.map(page => ({
        id: page.id,
        name: page.name,
        accessToken: page.access_token,
        category: page.category,
        pictureUrl: page.picture?.data?.url
      }));
    } catch (error) {
      logger.error('Failed to get user pages:', error.response?.data || error.message);
      throw new Error('Failed to get Facebook pages');
    }
  }

  /**
   * Create a live video
   * @param {string} pageAccessToken - Page access token
   * @param {string} pageId - Facebook page ID
   * @param {Object} videoData - Video configuration
   * @returns {Promise<Object>} Live video details
   */
  async createLiveVideo(pageAccessToken, pageId, videoData) {
    try {
      const {
        title,
        description,
        status = 'UNPUBLISHED',
        enableBackupIngestUrls = true
      } = videoData;

      const response = await axios.post(
        `${this.apiBaseUrl}/${pageId}/live_videos`,
        {
          title,
          description,
          status,
          enable_backup_ingest_urls: enableBackupIngestUrls
        },
        {
          params: {
            access_token: pageAccessToken,
            fields: 'id,stream_url,secure_stream_url,status,video,embed_html,permalink_url'
          }
        }
      );

      const liveVideo = response.data;

      logger.info('Facebook live video created', {
        id: liveVideo.id,
        title
      });

      return {
        id: liveVideo.id,
        streamUrl: liveVideo.stream_url,
        secureStreamUrl: liveVideo.secure_stream_url,
        status: liveVideo.status,
        embedHtml: liveVideo.embed_html,
        permalinkUrl: liveVideo.permalink_url,
        videoId: liveVideo.video?.id
      };
    } catch (error) {
      logger.error('Failed to create Facebook live video:', error.response?.data || error.message);
      throw new Error('Failed to create Facebook live video');
    }
  }

  /**
   * Update live video
   * @param {string} pageAccessToken - Page access token
   * @param {string} liveVideoId - Live video ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>} Success status
   */
  async updateLiveVideo(pageAccessToken, liveVideoId, updates) {
    try {
      const body = {};
      if (updates.title) body.title = updates.title;
      if (updates.description) body.description = updates.description;
      if (updates.status) body.status = updates.status;

      await axios.post(
        `${this.apiBaseUrl}/${liveVideoId}`,
        body,
        {
          params: { access_token: pageAccessToken }
        }
      );

      logger.info('Facebook live video updated', { liveVideoId });
      return true;
    } catch (error) {
      logger.error('Failed to update live video:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * End a live video
   * @param {string} pageAccessToken - Page access token
   * @param {string} liveVideoId - Live video ID
   * @returns {Promise<boolean>} Success status
   */
  async endLiveVideo(pageAccessToken, liveVideoId) {
    try {
      await axios.post(
        `${this.apiBaseUrl}/${liveVideoId}`,
        { end_live_video: true },
        {
          params: { access_token: pageAccessToken }
        }
      );

      logger.info('Facebook live video ended', { liveVideoId });
      return true;
    } catch (error) {
      logger.error('Failed to end live video:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Delete a live video
   * @param {string} pageAccessToken - Page access token
   * @param {string} liveVideoId - Live video ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteLiveVideo(pageAccessToken, liveVideoId) {
    try {
      await axios.delete(`${this.apiBaseUrl}/${liveVideoId}`, {
        params: { access_token: pageAccessToken }
      });

      logger.info('Facebook live video deleted', { liveVideoId });
      return true;
    } catch (error) {
      logger.error('Failed to delete live video:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Get live video details
   * @param {string} pageAccessToken - Page access token
   * @param {string} liveVideoId - Live video ID
   * @returns {Promise<Object>} Live video details
   */
  async getLiveVideo(pageAccessToken, liveVideoId) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/${liveVideoId}`, {
        params: {
          access_token: pageAccessToken,
          fields: 'id,title,description,status,stream_url,secure_stream_url,video,live_views,permalink_url,creation_time'
        }
      });

      const liveVideo = response.data;

      return {
        id: liveVideo.id,
        title: liveVideo.title,
        description: liveVideo.description,
        status: liveVideo.status,
        streamUrl: liveVideo.stream_url,
        secureStreamUrl: liveVideo.secure_stream_url,
        liveViews: liveVideo.live_views || 0,
        permalinkUrl: liveVideo.permalink_url,
        creationTime: liveVideo.creation_time
      };
    } catch (error) {
      logger.error('Failed to get live video:', error.response?.data || error.message);
      throw new Error('Failed to get Facebook live video');
    }
  }

  /**
   * Get live video insights (analytics)
   * @param {string} pageAccessToken - Page access token
   * @param {string} liveVideoId - Live video ID
   * @returns {Promise<Object>} Video insights
   */
  async getLiveVideoInsights(pageAccessToken, liveVideoId) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/${liveVideoId}/video_insights`, {
        params: {
          access_token: pageAccessToken,
          metric: 'total_video_views,total_video_views_unique,total_video_impressions'
        }
      });

      const insights = {};
      response.data.data.forEach(metric => {
        insights[metric.name] = metric.values[0]?.value || 0;
      });

      return insights;
    } catch (error) {
      logger.error('Failed to get live video insights:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Parse RTMP URL for streaming
   * @param {string} streamUrl - Stream URL from Facebook
   * @returns {Object} RTMP URL and stream key
   */
  parseStreamUrl(streamUrl) {
    // Facebook stream URLs are in format: rtmp://server/path/streamkey
    const match = streamUrl.match(/^(rtmps?:\/\/[^\/]+\/[^\/]+)\/(.+)$/);

    if (!match) {
      return {
        rtmpUrl: streamUrl,
        streamKey: ''
      };
    }

    return {
      rtmpUrl: match[1],
      streamKey: match[2]
    };
  }
}

module.exports = new FacebookStreamService();
