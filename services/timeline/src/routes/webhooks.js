/**
 * ═══════════════════════════════════════════════════════════
 * Webhook Routes
 * Receive events from other services
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const crypto = require('crypto');
const { asyncHandler } = require('@exprsn/shared');
const logger = require('../utils/logger');
const { Post } = require('../models');
const moderationSink = require('../services/moderationSink');

const router = express.Router();

/**
 * Require a valid HMAC-SHA256 signature over the raw request body.
 *
 * The sender computes `sha256 HMAC(rawBody, secret)` (hex) and sends it in
 * the `x-webhook-signature` header (optionally prefixed with `sha256=`).
 * The raw body is captured by the JSON parser's verify hook in
 * src/index.js (req.rawBody).
 *
 * Fails closed: if the shared secret is not configured the endpoint
 * returns 503 rather than accepting unauthenticated events.
 *
 * @param {string} secretEnvVar - Environment variable holding the secret
 * @returns {Function} Express middleware
 */
function requireWebhookSignature(secretEnvVar) {
  return (req, res, next) => {
    const secret = process.env[secretEnvVar];

    if (!secret) {
      logger.error('Webhook secret not configured — rejecting webhook', {
        secretEnvVar,
        path: req.path
      });
      return res.status(503).json({
        success: false,
        error: 'WEBHOOK_NOT_CONFIGURED',
        message: 'Webhook authentication is not configured on this server'
      });
    }

    const signatureHeader = req.headers['x-webhook-signature'];

    if (!signatureHeader || !req.rawBody) {
      logger.warn('Webhook request missing signature or raw body', {
        path: req.path,
        hasSignature: !!signatureHeader
      });
      return res.status(401).json({
        success: false,
        error: 'INVALID_SIGNATURE',
        message: 'Missing webhook signature'
      });
    }

    const provided = String(signatureHeader).replace(/^sha256=/i, '');
    const expected = crypto
      .createHmac('sha256', secret)
      .update(req.rawBody)
      .digest('hex');

    const providedBuf = Buffer.from(provided, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');

    const valid =
      providedBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(providedBuf, expectedBuf);

    if (!valid) {
      logger.warn('Webhook signature verification failed', { path: req.path });
      return res.status(401).json({
        success: false,
        error: 'INVALID_SIGNATURE',
        message: 'Webhook signature verification failed'
      });
    }

    next();
  };
}

/**
 * POST /api/webhooks/bluesky
 * Receive events from Bluesky PDS service
 * Authenticated via HMAC-SHA256 signature (BLUESKY_WEBHOOK_SECRET)
 */
router.post('/bluesky',
  requireWebhookSignature('BLUESKY_WEBHOOK_SECRET'),
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

            // This path rewrites posts.content BYPASSING postService — it is the
            // BUG-018 class ingress the ADR calls out. RE-MODERATE the edited
            // content (mode:'reset') exactly like postService.updatePost, or the
            // stale verdict would describe pre-edit bytes. Best-effort.
            try {
              const updated = await Post.findByPk(data.exprsnPostId);
              if (updated && !updated.deleted) {
                await moderationSink.establishPostModerationState({ post: updated, mode: 'reset' });
              }
            } catch (err) {
              logger.error('re-moderation on Bluesky record.updated failed', {
                postId: data.exprsnPostId, error: err.message
              });
            }
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
 * Receive moderation decisions from the moderator service.
 *
 * Authenticated via HMAC-SHA256 over the raw body (x-webhook-signature),
 * keyed with MODERATOR_WEBHOOK_SECRET — the same mechanism as the /bluesky
 * sibling. Fails closed: 503 when the secret is unconfigured, 401 without a
 * valid signature.
 */
router.post('/moderator',
  requireWebhookSignature('MODERATOR_WEBHOOK_SECRET'),
  asyncHandler(async (req, res) => {
    const { event, data } = req.body;

    logger.info('Moderator webhook received', { event });

    try {
      switch (event) {
        case 'content.flagged': {
          // Handle flagged content. Merge into the post's existing metadata so
          // an approval hold (metadata.approval) or other fields are preserved
          // rather than clobbered by a full metadata replacement.
          if (data.postId) {
            const post = await Post.findByPk(data.postId);
            if (post) {
              await post.update({
                metadata: {
                  ...(post.metadata || {}),
                  moderationStatus: 'flagged',
                  moderationReasons: data.reasons
                }
              });
            }
          }
          break;
        }

        case 'content.approved': {
          // Handle approved content (merge, see content.flagged above).
          if (data.postId) {
            const post = await Post.findByPk(data.postId);
            if (post) {
              await post.update({
                metadata: {
                  ...(post.metadata || {}),
                  moderationStatus: 'approved'
                }
              });
            }
          }
          break;
        }

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

/**
 * POST /api/webhooks/approval
 * Approval decision callback for held posts ("Require Approval for New
 * Posts"). Called back by the configured approval mechanism — a lowcode
 * flow's http_request action, or an external webhook consumer.
 *
 * Authenticated via HMAC-SHA256 over the raw body (x-webhook-signature),
 * keyed with the PERSISTED moderation approvalSecret (falling back to
 * TIMELINE_APPROVAL_WEBHOOK_SECRET). Fails closed when neither is set.
 *
 * Body: { postId, decision: 'approved' | 'rejected', reason?, decidedBy? }
 */
router.post('/approval', asyncHandler(async (req, res) => {
  const moderationConfig = require('../services/moderationConfig');
  const approvalService = require('../services/approvalService');

  const policy = await moderationConfig.getModeration();
  const secret = policy.approvalSecret || process.env.TIMELINE_APPROVAL_WEBHOOK_SECRET;

  if (!secret) {
    logger.error('Approval webhook rejected — no approval secret configured');
    return res.status(503).json({
      success: false,
      error: 'WEBHOOK_NOT_CONFIGURED',
      message: 'Approval webhook authentication is not configured on this server'
    });
  }

  const signatureHeader = req.headers['x-webhook-signature'];
  if (!signatureHeader || !req.rawBody) {
    return res.status(401).json({ success: false, error: 'INVALID_SIGNATURE', message: 'Missing webhook signature' });
  }

  const provided = String(signatureHeader).replace(/^sha256=/i, '');
  const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const valid = providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
  if (!valid) {
    logger.warn('Approval webhook signature verification failed');
    return res.status(401).json({ success: false, error: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' });
  }

  const { postId, decision, reason, decidedBy } = req.body || {};
  if (!postId || !decision) {
    return res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'postId and decision are required' });
  }

  try {
    const post = await approvalService.applyDecision(postId, String(decision), {
      decidedBy: decidedBy || 'webhook',
      reason
    });
    res.json({ success: true, postId: post.id, status: post.metadata?.approval?.status });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: 'APPROVAL_ERROR', message: error.message });
  }
}));

module.exports = router;
