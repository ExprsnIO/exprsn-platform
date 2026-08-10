/**
 * ═══════════════════════════════════════════════════════════
 * Webhook Routes
 * Receive events from other services
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const logger = require('../utils/logger');
const { Post } = require('../models');

const router = express.Router();

/**
 * POST /api/webhooks/bluesky
 * Receive events from Bluesky PDS service
 */
router.post('/bluesky',
  asyncHandler(async (req, res) => {
    const { event, data } = req.body;

    logger.info('Bluesky webhook received', {
      event,
      uri: data?.uri,
      did: data?.did
    });

    try {
      switch (event) {
        case 'record.created':
          // Bluesky post was created, check if it needs to be synced
          if (data.collection === 'app.bsky.feed.post') {
            logger.info('Bluesky post created', { uri: data.uri });
            // The Bluesky service will handle creating the Timeline post
          }
          break;

        case 'record.updated':
          // Update corresponding Timeline post
          if (data.exprsnPostId) {
            await Post.update({
              content: data.value.text,
              metadata: {
                ...data.metadata,
                lastSyncedFromBluesky: new Date()
              }
            }, {
              where: { id: data.exprsnPostId }
            });
            logger.info('Updated Timeline post from Bluesky', {
              postId: data.exprsnPostId
            });
          }
          break;

        case 'record.deleted':
          // Soft delete corresponding Timeline post
          if (data.exprsnPostId) {
            await Post.update({
              deleted: true
            }, {
              where: { id: data.exprsnPostId }
            });
            logger.info('Deleted Timeline post from Bluesky webhook', {
              postId: data.exprsnPostId
            });
          }
          break;

        case 'like.created':
          // Handle Bluesky like
          logger.info('Bluesky like received', { uri: data.uri });
          break;

        case 'repost.created':
          // Handle Bluesky repost
          logger.info('Bluesky repost received', { uri: data.uri });
          break;

        default:
          logger.warn('Unknown Bluesky webhook event', { event });
      }

      res.json({
        success: true,
        message: 'Webhook processed'
      });
    } catch (error) {
      logger.error('Bluesky webhook processing failed', {
        error: error.message,
        event
      });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  })
);

/**
 * POST /api/webhooks/moderator
 * Receive moderation decisions
 */
router.post('/moderator',
  asyncHandler(async (req, res) => {
    const { event, data } = req.body;

    logger.info('Moderator webhook received', { event });

    try {
      switch (event) {
        case 'content.flagged':
          // Handle flagged content
          if (data.postId) {
            await Post.update({
              metadata: {
                moderationStatus: 'flagged',
                moderationReasons: data.reasons
              }
            }, {
              where: { id: data.postId }
            });
          }
          break;

        case 'content.approved':
          // Handle approved content
          if (data.postId) {
            await Post.update({
              metadata: {
                moderationStatus: 'approved'
              }
            }, {
              where: { id: data.postId }
            });
          }
          break;

        default:
          logger.warn('Unknown moderator event', { event });
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Moderator webhook processing failed', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  })
);

module.exports = router;
