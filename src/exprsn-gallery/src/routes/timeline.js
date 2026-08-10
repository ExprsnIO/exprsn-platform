/**
 * ═══════════════════════════════════════════════════════════════════════
 * Timeline Routes - Integration with Timeline Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const timelineService = require('../services/timelineService');
const tokenService = require('../services/tokenService');
const Album = require('../models/Album');
const TimelinePost = require('../models/TimelinePost');
const { requireToken, auditAction } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * POST /api/timeline/albums/:albumId - Post album to timeline
 */
router.post('/albums/:albumId',
  requireToken({ write: true }),
  auditAction('album_posted_to_timeline', 'album'),
  async (req, res) => {
    try {
      const { albumId } = req.params;
      const { caption, visibility } = req.body;

      const album = await Album.findById(albumId);

      if (!album) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Album not found'
        });
      }

      // Check if user owns the album
      if (album.owner_id !== req.userId) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Only album owner can post to timeline'
        });
      }

      const post = await timelineService.postAlbumToTimeline(albumId, req.userId, {
        caption,
        visibility,
        token: tokenService.extractToken(req)
      });

      if (!post) {
        return res.status(500).json({
          error: 'TIMELINE_ERROR',
          message: 'Failed to post album to timeline'
        });
      }

      res.status(201).json({
        success: true,
        post
      });

    } catch (error) {
      logger.error('Post album to timeline error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to post album to timeline'
      });
    }
  }
);

/**
 * GET /api/timeline/posts/:postId - Get timeline post details
 */
router.get('/posts/:postId',
  requireToken({ read: true }),
  async (req, res) => {
    try {
      const { postId } = req.params;

      const post = await TimelinePost.getWithDetails(postId);

      if (!post) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Timeline post not found'
        });
      }

      res.json({ post });

    } catch (error) {
      logger.error('Get timeline post error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get timeline post'
      });
    }
  }
);

/**
 * DELETE /api/timeline/posts/:postId - Delete timeline post
 */
router.delete('/posts/:postId',
  requireToken({ delete: true }),
  auditAction('timeline_post_deleted', 'timeline_post'),
  async (req, res) => {
    try {
      const { postId } = req.params;

      const post = await TimelinePost.findById(postId);

      if (!post) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Timeline post not found'
        });
      }

      // Check if user owns the post
      if (post.user_id !== req.userId) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Not authorized to delete this post'
        });
      }

      // Delete from timeline service
      if (post.timeline_post_id) {
        await timelineService.deletePostFromTimeline(
          post.timeline_post_id,
          req.userId,
          tokenService.extractToken(req)
        );
      }

      // Soft delete from our database
      await TimelinePost.delete(postId);

      res.json({
        success: true,
        message: 'Timeline post deleted'
      });

    } catch (error) {
      logger.error('Delete timeline post error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to delete timeline post'
      });
    }
  }
);

/**
 * GET /api/timeline/user/:userId - Get user's timeline posts
 */
router.get('/user/:userId',
  requireToken({ read: true }),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      const posts = await TimelinePost.findByUser(userId, { limit, offset });

      res.json({
        posts,
        pagination: {
          limit,
          offset,
          total: posts.length
        }
      });

    } catch (error) {
      logger.error('Get user timeline posts error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get timeline posts'
      });
    }
  }
);

module.exports = router;
