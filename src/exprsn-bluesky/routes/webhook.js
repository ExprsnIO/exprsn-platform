const express = require('express');
const router = express.Router();
const { asyncHandler, logger } = require('@exprsn/shared');
const queueService = require('../services/queueService');
const syncController = require('../controllers/syncController');

// Webhook from Timeline service (post created/updated/deleted)
router.post('/timeline',
  asyncHandler(async (req, res) => {
    const { event, data } = req.body;

    logger.info('Timeline webhook received', { event, postId: data?.id });

    try {
      switch (event) {
        case 'post.created':
          // Queue sync to Bluesky
          await queueService.syncPost('to_bluesky', {
            type: 'create',
            post: data
          });
          break;

        case 'post.updated':
          // Queue sync update to Bluesky
          await queueService.syncPost('to_bluesky', {
            type: 'update',
            post: data
          });
          break;

        case 'post.deleted':
          // Queue deletion sync to Bluesky
          await queueService.syncPost('to_bluesky', {
            type: 'delete',
            post: data
          });
          break;

        case 'post.liked':
          // Queue like sync to Bluesky
          await queueService.syncPost('to_bluesky', {
            type: 'like',
            post: data.post,
            userId: data.userId
          });
          break;

        default:
          logger.warn('Unknown timeline event', { event });
      }

      res.json({ success: true, message: 'Webhook processed' });
    } catch (error) {
      logger.error('Timeline webhook processing failed', {
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

// Webhook from Herald service (notification events)
router.post('/herald',
  asyncHandler(async (req, res) => {
    const { event, data } = req.body;

    logger.info('Herald webhook received', { event });

    // Process notification events if needed

    res.json({ success: true });
  })
);

// Webhook from Moderator service (moderation decisions)
router.post('/moderator',
  asyncHandler(async (req, res) => {
    const { event, data } = req.body;

    logger.info('Moderator webhook received', { event });

    switch (event) {
      case 'content.flagged':
        // Handle flagged content
        break;

      case 'content.approved':
        // Handle approved content
        break;
    }

    res.json({ success: true });
  })
);

module.exports = router;
