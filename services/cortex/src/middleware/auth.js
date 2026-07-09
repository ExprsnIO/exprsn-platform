'use strict';

/**
 * CA-token auth for the cortex module. Every prompt/skill/tool/agent endpoint
 * requires a CA bearer token (validateCAToken populates req.userId /
 * req.permissions / req.tokenData); registry mutations and the review queue
 * additionally require a platform admin (PLATFORM_ADMIN_EMAILS allowlist —
 * same source of truth as the CA / moderator / atproto admin guards).
 */

const { validateCAToken } = require('@exprsn/shared');
const { isPlatformAdmin } = require('@exprsn/shared/utils/platformAdmin');
const config = require('../config');

const caRead = validateCAToken({ requiredPermissions: ['read'] });
const caWrite = validateCAToken({ requiredPermissions: ['write'] });

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

module.exports = { caRead, caWrite, requireCortexAdmin, requireEnabled, isAdminReq };
