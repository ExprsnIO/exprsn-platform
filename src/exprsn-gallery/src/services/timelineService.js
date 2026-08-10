/**
 * ═══════════════════════════════════════════════════════════════════════
 * Timeline Service - Integration with Timeline Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const TimelinePost = require('../models/TimelinePost');
const Album = require('../models/Album');
const Media = require('../models/Media');

class TimelineService {
  constructor() {
    this.timelineServiceUrl = config.timeline.serviceUrl;
    this.enabled = config.timeline.enabled;
  }

  /**
   * Post album to timeline
   * @param {string} albumId - Album ID
   * @param {string} userId - User ID
   * @param {Object} options - Post options
   * @returns {Promise<Object>}
   */
  async postAlbumToTimeline(albumId, userId, options = {}) {
    if (!this.enabled) {
      logger.info('Timeline integration disabled');
      return null;
    }

    try {
      const album = await Album.findById(albumId);
      if (!album) {
        throw new Error('Album not found');
      }

      const {
        caption = null,
        visibility = album.visibility || 'public',
        token = null
      } = options;

      // Get album media for preview
      const media = await Media.findByAlbum(albumId, { limit: 4, status: 'ready' });

      // Prepare post data for timeline service
      const postData = {
        userId,
        content: caption || `Shared album: ${album.name}`,
        contentType: 'album_share',
        visibility,
        attachments: [
          {
            type: 'gallery_album',
            albumId: album.id,
            albumName: album.name,
            albumDescription: album.description,
            coverImage: album.cover_media_id,
            mediaCount: album.media_count,
            previewMedia: media.map(m => ({
              id: m.id,
              type: m.media_type,
              thumbnails: m.thumbnails,
              url: this.buildMediaUrl(m.id)
            }))
          }
        ],
        metadata: {
          source: 'exprsn-gallery',
          sourceId: albumId,
          albumTags: album.tags
        }
      };

      // Post to timeline service
      const response = await axios.post(
        `${this.timelineServiceUrl}/api/posts`,
        postData,
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : undefined
          }
        }
      );

      const timelinePost = response.data.post;

      // Store reference in our database
      const post = await TimelinePost.create({
        albumId: album.id,
        userId,
        timelinePostId: timelinePost.id,
        caption,
        postType: 'album_share',
        visibility
      });

      logger.info('Album posted to timeline', {
        albumId: album.id,
        timelinePostId: timelinePost.id,
        userId
      });

      return {
        ...post,
        timelinePost
      };

    } catch (error) {
      logger.error('Failed to post album to timeline:', {
        error: error.message,
        albumId,
        userId
      });

      // Don't fail the request if timeline is unavailable
      // Just log and return null
      return null;
    }
  }

  /**
   * Post media to timeline
   * @param {string} mediaId - Media ID
   * @param {string} userId - User ID
   * @param {Object} options - Post options
   * @returns {Promise<Object>}
   */
  async postMediaToTimeline(mediaId, userId, options = {}) {
    if (!this.enabled) {
      logger.info('Timeline integration disabled');
      return null;
    }

    try {
      const media = await Media.getWithAlbum(mediaId);
      if (!media) {
        throw new Error('Media not found');
      }

      const {
        caption = media.caption || media.description || null,
        visibility = media.album_visibility || 'public',
        token = null
      } = options;

      // Prepare post data for timeline service
      const postData = {
        userId,
        content: caption || `Shared a ${media.media_type}`,
        contentType: 'media_share',
        visibility,
        attachments: [
          {
            type: media.media_type === 'image' ? 'gallery_image' : 'gallery_video',
            mediaId: media.id,
            albumId: media.album_id,
            albumName: media.album_name,
            filename: media.filename,
            mimetype: media.mimetype,
            dimensions: {
              width: media.width,
              height: media.height
            },
            duration: media.duration,
            thumbnails: media.thumbnails,
            url: this.buildMediaUrl(media.id),
            altText: media.alt_text
          }
        ],
        metadata: {
          source: 'exprsn-gallery',
          sourceId: mediaId,
          mediaTags: media.tags,
          takenAt: media.taken_at,
          location: media.location_name ? {
            name: media.location_name,
            lat: media.location_lat,
            lon: media.location_lon
          } : null
        }
      };

      // Post to timeline service
      const response = await axios.post(
        `${this.timelineServiceUrl}/api/posts`,
        postData,
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : undefined
          }
        }
      );

      const timelinePost = response.data.post;

      // Store reference in our database
      const post = await TimelinePost.create({
        mediaId: media.id,
        albumId: media.album_id,
        userId,
        timelinePostId: timelinePost.id,
        caption,
        postType: 'media_share',
        visibility
      });

      logger.info('Media posted to timeline', {
        mediaId: media.id,
        timelinePostId: timelinePost.id,
        userId
      });

      return {
        ...post,
        timelinePost
      };

    } catch (error) {
      logger.error('Failed to post media to timeline:', {
        error: error.message,
        mediaId,
        userId
      });

      return null;
    }
  }

  /**
   * Delete post from timeline
   * @param {string} timelinePostId - Timeline post ID
   * @param {string} userId - User ID
   * @param {string} token - Auth token
   * @returns {Promise<boolean>}
   */
  async deletePostFromTimeline(timelinePostId, userId, token) {
    if (!this.enabled) {
      return true;
    }

    try {
      await axios.delete(
        `${this.timelineServiceUrl}/api/posts/${timelinePostId}`,
        {
          timeout: 5000,
          headers: {
            'Authorization': token ? `Bearer ${token}` : undefined
          }
        }
      );

      logger.info('Post deleted from timeline', {
        timelinePostId,
        userId
      });

      return true;

    } catch (error) {
      logger.error('Failed to delete post from timeline:', {
        error: error.message,
        timelinePostId
      });

      return false;
    }
  }

  /**
   * Build media URL for external access
   * @param {string} mediaId - Media ID
   * @returns {string}
   */
  buildMediaUrl(mediaId) {
    const baseUrl = config.cdn.enabled
      ? config.cdn.endpoint
      : `http://${config.service.host}:${config.service.port}`;

    return `${baseUrl}/api/media/${mediaId}/view`;
  }

  /**
   * Sync timeline posts for album
   * (Called when album is updated)
   * @param {string} albumId - Album ID
   * @returns {Promise<void>}
   */
  async syncAlbumPosts(albumId) {
    if (!this.enabled) {
      return;
    }

    try {
      const posts = await TimelinePost.findByAlbum(albumId);

      for (const post of posts) {
        if (post.timeline_post_id) {
          // Optionally update timeline post with new album data
          // For now, just log
          logger.debug('Album post exists on timeline', {
            albumId,
            timelinePostId: post.timeline_post_id
          });
        }
      }

    } catch (error) {
      logger.error('Failed to sync album posts:', {
        error: error.message,
        albumId
      });
    }
  }

  /**
   * Auto-post new media upload to timeline
   * (Optional feature based on user settings)
   * @param {string} mediaId - Media ID
   * @param {string} userId - User ID
   * @param {Object} options - Options
   * @returns {Promise<Object>}
   */
  async autoPostMediaUpload(mediaId, userId, options = {}) {
    if (!this.enabled) {
      return null;
    }

    // Check if auto-posting is enabled for this user
    // This would come from user settings/preferences
    const autoPostEnabled = options.autoPost || false;

    if (!autoPostEnabled) {
      return null;
    }

    return this.postMediaToTimeline(mediaId, userId, {
      caption: options.caption || 'Uploaded a new photo',
      visibility: options.visibility || 'public',
      token: options.token
    });
  }
}

// Singleton instance
const timelineService = new TimelineService();

module.exports = timelineService;
