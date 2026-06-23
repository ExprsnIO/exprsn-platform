/**
 * ═══════════════════════════════════════════════════════════
 * GET /xrpc/com.exprsn.identity.resolveDid?did=did:exprsn:...
 *
 * Resolves a DID to its document. did:exprsn (and did:key) resolve offline from
 * the embedded key; did:web is fetched. This is the public resolution surface
 * for Exprsn's native DID method so other nodes can discover our labeler and
 * verify the labels we issue.
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const didResolver = require('../identity/didResolver');

function createResolveDidRouter() {
  const router = express.Router();

  router.get('/xrpc/com.exprsn.identity.resolveDid', async (req, res) => {
    const did = req.query.did ? String(req.query.did) : '';
    if (!did) return res.status(400).json({ error: 'InvalidRequest', message: 'did is required' });
    try {
      const resolved = await didResolver.resolveDid(did);
      if (!resolved) return res.status(404).json({ error: 'DidNotFound', did });
      res.json(resolved.doc);
    } catch (err) {
      res.status(500).json({ error: 'InternalServerError' });
    }
  });

  return router;
}

module.exports = { createResolveDidRouter };
