const express = require('express');
const router = express.Router();
const { asyncHandler } = require('@exprsn/shared');
const sessionService = require('../services/sessionService');
const timelineIntegration = require('../services/integrations/timelineIntegration');
const repositoryService = require('../services/repositoryService');
const { Account, Record } = require('../models');
const { Op } = require('sequelize');

/**
 * Middleware to validate session token
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  const accessToken = req.headers['authorization']?.replace('Bearer ', '');

  if (!accessToken) {
    return res.status(401).json({
      error: 'AuthRequired',
      message: 'Authorization required'
    });
  }

  const session = await sessionService.validateToken(accessToken);

  if (!session) {
    return res.status(401).json({
      error: 'InvalidToken',
      message: 'Invalid or expired token'
    });
  }

  req.session = session;
  next();
});

/**
 * XRPC: Get timeline (home feed)
 * GET /xrpc/app.bsky.feed.getTimeline
 */
router.get('/app.bsky.feed.getTimeline', requireAuth, asyncHandler(async (req, res) => {
  const { limit = 50, cursor } = req.query;
  const { exprsnUserId } = req.session;

  // Get timeline from exprsn-timeline service
  const timeline = await timelineIntegration.getUserTimeline(exprsnUserId, {
    limit: parseInt(limit),
    cursor
  });

  // Convert timeline posts to Bluesky feed format
  const feed = timeline.posts.map(post => ({
    post: {
      uri: `at://${post.did || req.session.did}/app.bsky.feed.post/${post.id}`,
      cid: post.cid || repositoryService.generateCID(post),
      author: {
        did: post.author?.did || req.session.did,
        handle: post.author?.handle || req.session.handle,
        displayName: post.author?.displayName || post.author?.username,
        avatar: post.author?.avatar
      },
      record: {
        text: post.content,
        createdAt: post.createdAt,
        $type: 'app.bsky.feed.post'
      },
      likeCount: post.stats?.likes || 0,
      repostCount: post.stats?.shares || 0,
      replyCount: post.stats?.comments || 0,
      indexedAt: post.indexedAt || post.createdAt
    },
    reply: post.replyTo ? {
      parent: {
        uri: `at://${post.replyTo.did}/app.bsky.feed.post/${post.replyTo.id}`
      }
    } : undefined
  }));

  res.json({
    cursor: timeline.nextCursor,
    feed
  });
}));

/**
 * XRPC: Get author feed
 * GET /xrpc/app.bsky.feed.getAuthorFeed
 */
router.get('/app.bsky.feed.getAuthorFeed', asyncHandler(async (req, res) => {
  const { actor, limit = 50, cursor } = req.query;

  if (!actor) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Actor parameter required (handle or DID)'
    });
  }

  // Resolve actor to DID
  let did = actor;
  if (!actor.startsWith('did:')) {
    const account = await Account.findOne({
      where: { handle: actor },
      attributes: ['did', 'exprsnUserId']
    });

    if (!account) {
      return res.status(404).json({
        error: 'ActorNotFound',
        message: 'Actor not found'
      });
    }

    did = account.did;
  }

  // Get repository
  const repository = await repositoryService.getRepository(did);

  if (!repository) {
    return res.status(404).json({
      error: 'RepoNotFound',
      message: 'Repository not found'
    });
  }

  // Get posts from timeline service
  const feed = await timelineIntegration.getUserPosts(repository.account.exprsnUserId, {
    limit: parseInt(limit),
    cursor
  });

  // Convert to Bluesky format
  const formattedFeed = feed.posts.map(post => ({
    post: {
      uri: `at://${did}/app.bsky.feed.post/${post.id}`,
      cid: post.cid || repositoryService.generateCID(post),
      author: {
        did: did,
        handle: repository.account.handle,
        displayName: repository.account.displayName,
        avatar: repository.account.avatarCid
      },
      record: {
        text: post.content,
        createdAt: post.createdAt,
        $type: 'app.bsky.feed.post'
      },
      likeCount: post.stats?.likes || 0,
      repostCount: post.stats?.shares || 0,
      replyCount: post.stats?.comments || 0,
      indexedAt: post.indexedAt || post.createdAt
    }
  }));

  res.json({
    cursor: feed.nextCursor,
    feed: formattedFeed
  });
}));

/**
 * XRPC: Get post thread
 * GET /xrpc/app.bsky.feed.getPostThread
 */
router.get('/app.bsky.feed.getPostThread', asyncHandler(async (req, res) => {
  const { uri, depth = 6, parentHeight = 80 } = req.query;

  if (!uri) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'URI parameter required'
    });
  }

  // Parse AT URI: at://did/collection/rkey
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Invalid AT URI format'
    });
  }

  const [, did, collection, rkey] = match;

  // Get record
  const record = await repositoryService.getRecord(uri);

  if (!record) {
    return res.status(404).json({
      error: 'RecordNotFound',
      message: 'Post not found'
    });
  }

  // Get repository/account info
  const repository = await repositoryService.getRepository(did);

  // Build thread (simplified - just return the post for now)
  // TODO: Implement full thread traversal
  const thread = {
    post: {
      uri,
      cid: record.cid,
      author: {
        did,
        handle: repository.account.handle,
        displayName: repository.account.displayName
      },
      record: record.value,
      likeCount: 0,
      repostCount: 0,
      replyCount: 0,
      indexedAt: record.indexedAt
    }
  };

  res.json({ thread });
}));

/**
 * XRPC: Get likes for a post
 * GET /xrpc/app.bsky.feed.getLikes
 */
router.get('/app.bsky.feed.getLikes', asyncHandler(async (req, res) => {
  const { uri, limit = 50, cursor } = req.query;

  if (!uri) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'URI parameter required'
    });
  }

  // Parse post ID from URI
  const match = uri.match(/\/([^/]+)$/);
  const postId = match ? match[1] : null;

  if (!postId) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Invalid URI'
    });
  }

  // Get likes from timeline service
  const likes = await timelineIntegration.getPostLikes(postId, {
    limit: parseInt(limit),
    cursor
  });

  // Convert to Bluesky format
  const formattedLikes = likes.likes.map(like => ({
    indexedAt: like.createdAt,
    createdAt: like.createdAt,
    actor: {
      did: like.user?.did || `did:web:exprsn.io:${like.userId}`,
      handle: like.user?.handle || like.user?.username,
      displayName: like.user?.displayName || like.user?.username
    }
  }));

  res.json({
    uri,
    cursor: likes.nextCursor,
    likes: formattedLikes
  });
}));

/**
 * XRPC: Get feed skeleton (custom algorithm)
 * GET /xrpc/app.bsky.feed.getFeedSkeleton
 */
router.get('/app.bsky.feed.getFeedSkeleton', requireAuth, asyncHandler(async (req, res) => {
  const { feed, limit = 50, cursor } = req.query;

  // For now, return timeline (can implement custom algorithms later)
  const timeline = await timelineIntegration.getUserTimeline(req.session.exprsnUserId, {
    limit: parseInt(limit),
    cursor
  });

  const feedItems = timeline.posts.map(post => ({
    post: `at://${post.author?.did || req.session.did}/app.bsky.feed.post/${post.id}`
  }));

  res.json({
    cursor: timeline.nextCursor,
    feed: feedItems
  });
}));

module.exports = router;
