/**
 * ═══════════════════════════════════════════════════════════
 * .well-known surface for did:web
 *
 *   GET /.well-known/did.json        → the labeler DID document
 *   GET /.well-known/atproto-did     → the DID as text/plain
 *
 * Served at the ORIGIN ROOT (not under /atproto) because did:web resolution and
 * AT-Protocol clients require these exact absolute paths.
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const config = require('../config');
const identityService = require('./labeler/identityService');

function createWellKnownRouter(models) {
  const router = express.Router();

  router.get('/.well-known/did.json', async (req, res) => {
    try {
      const doc = await identityService.getDidDocument(models);
      if (!doc) return res.status(404).json({ error: 'NotFound', message: 'labeler identity not provisioned' });
      res.json(doc);
    } catch (err) {
      res.status(500).json({ error: 'InternalServerError' });
    }
  });

  router.get('/.well-known/atproto-did', async (req, res) => {
    try {
      const active = await identityService.loadActive(models);
      const did = (active && active.did) || config.labeler.did;
      if (!did) return res.status(404).type('text/plain').send('');
      res.type('text/plain').send(did);
    } catch (err) {
      res.status(500).type('text/plain').send('');
    }
  });

  return router;
}

module.exports = { createWellKnownRouter };
