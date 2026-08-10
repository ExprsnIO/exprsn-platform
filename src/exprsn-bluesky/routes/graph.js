const express = require('express');
const router = express.Router();
const { asyncHandler } = require('@exprsn/shared');
const sessionService = require('../services/sessionService');
const timelineIntegration = require('../services/integrations/timelineIntegration');
const repositoryService = require('../services/repositoryService');
const { Account } = require('../models');

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
 * XRPC: Get follows
 * GET /xrpc/app.bsky.graph.getFollows
 */
router.get('/app.bsky.graph.getFollows', asyncHandler(async (req, res) => {
  const { actor, limit = 50, cursor } = req.query;

  if (!actor) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Actor parameter required'
    });
  }

  // Resolve actor to account
  const account = await resolveActor(actor);
  if (!account) {
    return res.status(404).json({
      error: 'ActorNotFound',
      message: 'Actor not found'
    });
  }

  // Get following list from timeline service
  const following = await timelineIntegration.getFollowing(account.exprsnUserId, {
    limit: parseInt(limit),
    cursor
  });

  const follows = following.users.map(user => ({
    did: user.did || `did:web:exprsn.io:${user.username}`,
    handle: user.handle || `${user.username}.exprsn.io`,
    displayName: user.displayName || user.username,
    avatar: user.avatar,
    indexedAt: user.followedAt || new Date().toISOString()
  }));

  res.json({
    subject: {
      did: account.did,
      handle: account.handle
    },
    cursor: following.nextCursor,
    follows
  });
}));

/**
 * XRPC: Get followers
 * GET /xrpc/app.bsky.graph.getFollowers
 */
router.get('/app.bsky.graph.getFollowers', asyncHandler(async (req, res) => {
  const { actor, limit = 50, cursor } = req.query;

  if (!actor) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Actor parameter required'
    });
  }

  // Resolve actor
  const account = await resolveActor(actor);
  if (!account) {
    return res.status(404).json({
      error: 'ActorNotFound',
      message: 'Actor not found'
    });
  }

  // Get followers from timeline service
  const followersList = await timelineIntegration.getFollowers(account.exprsnUserId, {
    limit: parseInt(limit),
    cursor
  });

  const followers = followersList.users.map(user => ({
    did: user.did || `did:web:exprsn.io:${user.username}`,
    handle: user.handle || `${user.username}.exprsn.io`,
    displayName: user.displayName || user.username,
    avatar: user.avatar,
    indexedAt: user.followerSince || new Date().toISOString()
  }));

  res.json({
    subject: {
      did: account.did,
      handle: account.handle
    },
    cursor: followersList.nextCursor,
    followers
  });
}));

/**
 * XRPC: Get blocks
 * GET /xrpc/app.bsky.graph.getBlocks
 */
router.get('/app.bsky.graph.getBlocks', requireAuth, asyncHandler(async (req, res) => {
  const { limit = 50, cursor } = req.query;

  // Get blocked users from timeline service
  const blocked = await timelineIntegration.getBlockedUsers(req.session.exprsnUserId, {
    limit: parseInt(limit),
    cursor
  });

  const blocks = blocked.users.map(user => ({
    did: user.did || `did:web:exprsn.io:${user.username}`,
    handle: user.handle || `${user.username}.exprsn.io`,
    displayName: user.displayName || user.username,
    avatar: user.avatar
  }));

  res.json({
    cursor: blocked.nextCursor,
    blocks
  });
}));

/**
 * XRPC: Get mutes
 * GET /xrpc/app.bsky.graph.getMutes
 */
router.get('/app.bsky.graph.getMutes', requireAuth, asyncHandler(async (req, res) => {
  const { limit = 50, cursor } = req.query;

  // Get muted users from timeline service
  const muted = await timelineIntegration.getMutedUsers(req.session.exprsnUserId, {
    limit: parseInt(limit),
    cursor
  });

  const mutes = muted.users.map(user => ({
    did: user.did || `did:web:exprsn.io:${user.username}`,
    handle: user.handle || `${user.username}.exprsn.io`,
    displayName: user.displayName || user.username,
    avatar: user.avatar
  }));

  res.json({
    cursor: muted.nextCursor,
    mutes
  });
}));

// Helper function
async function resolveActor(actor) {
  // If DID, find by DID
  if (actor.startsWith('did:')) {
    return await Account.findOne({
      where: { did: actor },
      attributes: ['id', 'did', 'handle', 'exprsnUserId', 'displayName']
    });
  }

  // Otherwise treat as handle
  return await Account.findOne({
    where: { handle: actor },
    attributes: ['id', 'did', 'handle', 'exprsnUserId', 'displayName']
  });
}

module.exports = router;
