'use strict';

/**
 * CA-token auth for the cortex module. Every prompt/skill/tool/agent endpoint
 * requires a CA bearer token (validateCAToken populates req.userId /
 * req.permissions / req.tokenData); registry mutations and the review queue
 * additionally require a platform admin (PLATFORM_ADMIN_EMAILS allowlist —
 * same source of truth as the CA / moderator / atproto admin guards).
 */

const { validateCAToken } = require('@exprsn/shared');
const { authenticateService } = require('@exprsn/shared/middleware/auth');
const { isPlatformAdmin } = require('@exprsn/shared/utils/platformAdmin');
const config = require('../config');

const caRead = validateCAToken({ requiredPermissions: ['read'] });
const caWrite = validateCAToken({ requiredPermissions: ['write'] });

// ── Inbound service-to-service auth (TASK-062) ─────────────────────────────
//
// Designated routes accept a per-service HMAC (X-Service-ID / X-Service-Token,
// derived from SERVICE_TOKEN_SECRET) IN LIEU OF a CA bearer, so other modules
// can call cortex over HTTP (cortex already presents these headers outbound —
// see engine/jobs.js moderatorScreen). Routing rule: if EITHER service header
// is present the request is authenticated as a service call (invalid/partial
// headers ⇒ 401, never a CA fallback — a bad service credential must not get
// a second chance via a bearer); with no service headers the CA-bearer path
// runs exactly as before. Service callers carry no user identity
// (req.userId stays unset ⇒ owner-scoped queries resolve to userId NULL) and
// are never platform admins (isAdminReq ⇒ false).
const serviceAuth = authenticateService();

function isServiceCall(req) {
  return Boolean(req.headers['x-service-id'] || req.headers['x-service-token']);
}

function caOrService(caMiddleware) {
  return (req, res, next) => {
    if (isServiceCall(req)) return serviceAuth(req, res, next);
    return caMiddleware(req, res, next);
  };
}

const caReadOrService = caOrService(caRead);
const caWriteOrService = caOrService(caWrite);

function isAdminReq(req) {
  return isPlatformAdmin(req.tokenData && req.tokenData.email);
}

// Use AFTER caRead/caWrite so the CA validator isn't run twice.
function requireCortexAdmin(req, res, next) {
  if (isAdminReq(req)) return next();
  return res.status(403).json({
    error: 'FORBIDDEN',
    message: 'Administrator privileges required',
  });
}

// Everything except /health 503s while the module ships dark (CORTEX_ENABLED).
function requireEnabled(req, res, next) {
  if (config.features.cortexEnabled) return next();
  return res.status(503).json({
    error: 'CORTEX_DISABLED',
    message: 'Cortex module is not enabled on this deployment (CORTEX_ENABLED)',
  });
}

module.exports = {
  caRead, caWrite, requireCortexAdmin, requireEnabled, isAdminReq,
  caReadOrService, caWriteOrService, isServiceCall,
};
