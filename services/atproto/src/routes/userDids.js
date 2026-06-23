/**
 * ═══════════════════════════════════════════════════════════
 * Per-user DID routes (mounted under /atproto)
 *
 *   GET    /atproto/users/:userId/dids           → public; mints did:exprsn lazily
 *   PUT    /atproto/users/:userId/dids           → link did:web/did:plc (owner/admin)
 *   DELETE /atproto/users/:userId/dids/:method   → unlink (owner/admin)
 *
 * Mutations require a valid CA bearer whose user id matches :userId, or the
 * admin service token (X-Service-Token). DIDs are public, so GET is open.
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const express = require('express');
const userDidService = require('../identity/userDidService');

let _validateCA = null;
function validateCA() {
  // Lazy-load @exprsn/shared (CA token middleware sets req.userId).
  if (!_validateCA) _validateCA = require('@exprsn/shared').validateCAToken({});
  return _validateCA;
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Allow the admin service token (server-to-server) OR a valid CA bearer whose
 * user id matches :userId. validateCAToken responds 401 itself on a bad token.
 */
function ownerOrAdmin(req, res, next) {
  const adminSecret = process.env.SERVICE_TOKEN_SECRET;
  if (adminSecret && timingSafeEqual(req.get('x-service-token'), adminSecret)) return next();
  return validateCA()(req, res, () => {
    if (req.userId && req.userId === req.params.userId) return next();
    return res.status(403).json({ error: 'forbidden', message: 'owner or admin token required' });
  });
}

function createUserDidsRouter(models) {
  const router = express.Router();

  router.get('/users/:userId/dids', async (req, res) => {
    try {
      const row = await userDidService.getOrCreate(models, req.params.userId);
      res.json(userDidService.serialize(row));
    } catch (err) {
      res.status(500).json({ error: 'user_did_failed', message: err.message });
    }
  });

  router.put('/users/:userId/dids', ownerOrAdmin, async (req, res) => {
    const { didWeb, didPlc } = req.body || {};
    try {
      let row = await userDidService.getOrCreate(models, req.params.userId);
      if (didWeb) row = await userDidService.link(models, req.params.userId, 'web', didWeb);
      if (didPlc) row = await userDidService.link(models, req.params.userId, 'plc', didPlc);
      res.json(userDidService.serialize(row));
    } catch (err) {
      res.status(400).json({ error: 'link_failed', message: err.message });
    }
  });

  // Issue a proof-of-control challenge token (owner/admin).
  router.post('/users/:userId/dids/challenge', ownerOrAdmin, async (req, res) => {
    try {
      const result = await userDidService.issueChallenge(models, req.params.userId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'challenge_failed', message: err.message });
    }
  });

  // Verify control of a linked did:web/did:plc against the challenge (owner/admin).
  router.post('/users/:userId/dids/verify', ownerOrAdmin, async (req, res) => {
    const method = (req.body && req.body.method) || '';
    try {
      const result = await userDidService.verifyControl(models, req.params.userId, method);
      res.status(result.verified ? 200 : 422).json(result);
    } catch (err) {
      res.status(400).json({ error: 'verify_failed', message: err.message });
    }
  });

  router.delete('/users/:userId/dids/:method', ownerOrAdmin, async (req, res) => {
    try {
      const row = await userDidService.unlink(models, req.params.userId, req.params.method);
      if (!row) return res.status(404).json({ error: 'not_found' });
      res.json(userDidService.serialize(row));
    } catch (err) {
      res.status(400).json({ error: 'unlink_failed', message: err.message });
    }
  });

  return router;
}

module.exports = { createUserDidsRouter };
