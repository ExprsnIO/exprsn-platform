'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Scope authority — who may administer a low-code resource.
 *
 * Real org/group RBAC (decisions ledger: "full org/group RBAC"). A low-code app
 * carries a scope (platform | organization | group | user); mutating it requires
 * matching authority:
 *   · platform     → platform admin (PLATFORM_ADMIN_EMAILS)
 *   · organization → org owner/admin (auth  /api/internal/orgs/:id/membership/:u)
 *   · group        → group owner/admin (nexus /api/internal/groups/:id/membership/:u)
 *   · user         → the owning user
 * A platform admin is a superuser across every scope.
 *
 * SECURITY: these checks are FAIL-CLOSED — unlike best-effort lookups, an errored
 * or unreachable authorization call returns DENY, never allow. Cross-module role
 * lookups go over the internal HTTPS gateway with the platform service identity.
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const { createLogger } = require('@exprsn/shared');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const { getInternalHttpsAgent } = require('@exprsn/shared/utils/httpAgent');

const logger = createLogger('exprsn-lowcode-authz');

const ADMIN_ROLES = ['owner', 'admin'];

function base(envUrl, fallbackPath) {
  return process.env[envUrl] || `${process.env.PUBLIC_BASE_URL || 'https://localhost:8443'}${fallbackPath}`;
}
function serviceHeaders() {
  const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME || 'platform';
  return { 'X-Service-ID': serviceId, 'X-Service-Token': deriveServiceToken(serviceId) };
}
async function membershipRole(url) {
  // Returns the role string (or null) from an internal membership endpoint.
  const { data } = await axios.get(url, { timeout: 4000, headers: serviceHeaders(), httpsAgent: getInternalHttpsAgent() });
  return data || {};
}

/**
 * Can `identity` administer resources at (scopeType, scopeId)? Fail-closed.
 * @param {{ userId:string, email?:string, isPlatformAdmin?:boolean }} identity
 */
async function canAdminScope(identity, scopeType, scopeId) {
  if (!identity || !identity.userId) return false;
  if (identity.isPlatformAdmin) return true; // superuser across all scopes

  switch (scopeType) {
    case 'platform':
      return false; // only platform admins (handled above)
    case 'user':
      return String(identity.userId) === String(scopeId);
    case 'organization': {
      if (!scopeId) return false;
      try {
        const m = await membershipRole(`${base('AUTH_SERVICE_URL', '/auth')}/api/internal/orgs/${scopeId}/membership/${identity.userId}`);
        return !!m.isOwner || ADMIN_ROLES.includes(m.role);
      } catch (err) {
        logger.warn('Org authority check failed — DENY (fail-closed)', { scopeId, error: err.message });
        return false;
      }
    }
    case 'group': {
      if (!scopeId) return false;
      try {
        const m = await membershipRole(`${base('NEXUS_SERVICE_URL', '/nexus')}/api/internal/groups/${scopeId}/membership/${identity.userId}`);
        return ADMIN_ROLES.includes(m.role);
      } catch (err) {
        logger.warn('Group authority check failed — DENY (fail-closed)', { scopeId, error: err.message });
        return false;
      }
    }
    default:
      return false;
  }
}

/** Convenience: authority over an app (by its scope). */
async function canAdminApp(identity, app) {
  if (!app) return false;
  return canAdminScope(identity, app.scopeType || 'platform', app.scopeId || null);
}

module.exports = { canAdminScope, canAdminApp, ADMIN_ROLES };
