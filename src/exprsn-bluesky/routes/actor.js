const express = require('express');
const router = express.Router();
const { asyncHandler } = require('@exprsn/shared');
const authIntegration = require('../services/integrations/authIntegration');
const { Account } = require('../models');
const { Op } = require('sequelize');

/**
 * XRPC: Get profile
 * GET /xrpc/app.bsky.actor.getProfile
 */
router.get('/app.bsky.actor.getProfile', asyncHandler(async (req, res) => {
  const { actor } = req.query;

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
      error: 'ProfileNotFound',
      message: 'Profile not found'
    });
  }

  // Get additional user info from auth service
  const userInfo = await authIntegration.getUserInfo(account.exprsnUserId);

  const profile = {
    did: account.did,
    handle: account.handle,
    displayName: account.displayName,
    description: account.description,
    avatar: account.avatarCid,
    banner: account.bannerCid,
    followersCount: userInfo?.followersCount || 0,
    followsCount: userInfo?.followingCount || 0,
    postsCount: userInfo?.postsCount || 0,
    indexedAt: account.createdAt
  };

  res.json(profile);
}));

/**
 * XRPC: Get profiles (batch)
 * GET /xrpc/app.bsky.actor.getProfiles
 */
router.get('/app.bsky.actor.getProfiles', asyncHandler(async (req, res) => {
  const { actors } = req.query;

  if (!actors) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Actors parameter required'
    });
  }

  const actorList = Array.isArray(actors) ? actors : [actors];

  // Get all accounts
  const accounts = await Account.findAll({
    where: {
      [Op.or]: [
        { did: { [Op.in]: actorList } },
        { handle: { [Op.in]: actorList } }
      ]
    },
    attributes: [
      'did',
      'handle',
      'displayName',
      'description',
      'avatarCid',
      'bannerCid',
      'createdAt'
    ]
  });

  const profiles = accounts.map(account => ({
    did: account.did,
    handle: account.handle,
    displayName: account.displayName,
    description: account.description,
    avatar: account.avatarCid,
    banner: account.bannerCid,
    indexedAt: account.createdAt
  }));

  res.json({ profiles });
}));

/**
 * XRPC: Search actors
 * GET /xrpc/app.bsky.actor.searchActors
 */
router.get('/app.bsky.actor.searchActors', asyncHandler(async (req, res) => {
  const { q, limit = 25, cursor } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Query must be at least 2 characters'
    });
  }

  const searchTerm = `%${q.trim()}%`;

  // Search accounts
  const accounts = await Account.findAll({
    where: {
      status: 'active',
      [Op.or]: [
        { handle: { [Op.iLike]: searchTerm } },
        { displayName: { [Op.iLike]: searchTerm } }
      ]
    },
    limit: parseInt(limit) + 1,
    order: [['createdAt', 'DESC']],
    attributes: [
      'did',
      'handle',
      'displayName',
      'description',
      'avatarCid',
      'createdAt'
    ]
  });

  const hasMore = accounts.length > limit;
  const actors = hasMore ? accounts.slice(0, limit) : accounts;

  const results = actors.map(account => ({
    did: account.did,
    handle: account.handle,
    displayName: account.displayName,
    description: account.description,
    avatar: account.avatarCid,
    indexedAt: account.createdAt
  }));

  res.json({
    cursor: hasMore ? results[results.length - 1].did : undefined,
    actors: results
  });
}));

/**
 * XRPC: Search actors typeahead (autocomplete)
 * GET /xrpc/app.bsky.actor.searchActorsTypeahead
 */
router.get('/app.bsky.actor.searchActorsTypeahead', asyncHandler(async (req, res) => {
  const { q, limit = 10 } = req.query;

  if (!q || q.trim().length < 1) {
    return res.json({ actors: [] });
  }

  const searchTerm = `${q.trim()}%`;

  // Quick search with prefix matching
  const accounts = await Account.findAll({
    where: {
      status: 'active',
      [Op.or]: [
        { handle: { [Op.iLike]: searchTerm } },
        { displayName: { [Op.iLike]: searchTerm } }
      ]
    },
    limit: parseInt(limit),
    order: [['handle', 'ASC']],
    attributes: ['did', 'handle', 'displayName', 'avatarCid']
  });

  const actors = accounts.map(account => ({
    did: account.did,
    handle: account.handle,
    displayName: account.displayName,
    avatar: account.avatarCid
  }));

  res.json({ actors });
}));

// Helper function
async function resolveActor(actor) {
  if (actor.startsWith('did:')) {
    return await Account.findOne({
      where: { did: actor, status: 'active' }
    });
  }

  return await Account.findOne({
    where: { handle: actor, status: 'active' }
  });
}

module.exports = router;
