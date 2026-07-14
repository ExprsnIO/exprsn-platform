/**
 * ═══════════════════════════════════════════════════════════
 * OpenID Connect (OIDC) Discovery Routes
 * ═══════════════════════════════════════════════════════════
 *
 * This router is mounted WITHOUT a prefix, because RFC 8414 / OpenID Discovery
 * require these documents to sit at the well-known root rather than under an
 * API prefix. That makes it the one router whose paths are absolute — so it
 * must declare ONLY `/.well-known/*` paths.
 *
 * The OIDC-protocol endpoints (`userinfo`, `introspect`, `revoke`) deliberately
 * live in `oauth2.js`, which owns every `/api/oauth2/*` path. They used to be
 * declared here with absolute `/api/oauth2/...` paths, and because this router
 * is mounted first they silently shadowed oauth2.js's own handlers, leaving
 * those unreachable (BUG-029). Do not reintroduce an `/api/...` path here.
 */

const express = require('express');
const router = express.Router();
const oidcService = require('../services/oidcService');

/**
 * GET /.well-known/openid-configuration
 * OIDC Discovery endpoint
 */
router.get('/.well-known/openid-configuration', (req, res) => {
  const discovery = oidcService.getDiscoveryDocument();
  res.json(discovery);
});

/**
 * GET /.well-known/jwks.json
 * JSON Web Key Set endpoint
 */
router.get('/.well-known/jwks.json', (req, res) => {
  const jwks = oidcService.getJwks();
  res.json(jwks);
});

module.exports = router;
