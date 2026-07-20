'use strict';

/**
 * requirePlatformAdmin — the one platform-admin gate for JSON admin surfaces
 * that have no module-local RBAC (TASK-039). Composes the shared CA bearer
 * validation with the platform-admin identity checks the per-module guards
 * already use, without touching any module's models:
 *
 *   1. validateCAToken (401s itself on missing/invalid bearer), then
 *   2. PLATFORM_ADMIN_EMAILS allowlist (utils/platformAdmin), or
 *   3. a normalized 'admin' role carried in the CA token payload
 *      (data.roles — minted by auth for global role-holders).
 *
 * Modules WITH local RBAC (auth, nexus, timeline, ca) keep their own guards;
 * this exists so the remaining config surfaces (spark, prefetch, moderator,
 * live) and the gateway's /platform/api/config share one implementation.
 */

const { validateCAToken } = require('./tokenValidation');
const { isPlatformAdmin } = require('../utils/platformAdmin');

function tokenRoles(tokenData) {
  const roles = tokenData && tokenData.data && tokenData.data.roles;
  return Array.isArray(roles) ? roles : [];
}

function isAdminToken(tokenData) {
  if (isPlatformAdmin(tokenData && tokenData.email)) return true;
  return tokenRoles(tokenData).some(
    (r) => r === 'admin' || r === 'system_admin' || r === 'super-admin',
  );
}

const _validateRead = validateCAToken({ requiredPermissions: ['read'] });

function requirePlatformAdmin(req, res, next) {
  return _validateRead(req, res, () => {
    if (isAdminToken(req.tokenData)) return next();
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Administrator privileges required',
    });
  });
}

module.exports = { requirePlatformAdmin, isAdminToken };
