'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Membership resolver — the org/group ids a user belongs to.
 *
 * Used to filter record visibility (record-level data isolation): a user may
 * see an org/group-scoped record only if they belong to that org/group. The
 * lists come from the auth + nexus internal endpoints over the service HMAC.
 *
 * SECURE-FAIL-EMPTY: if a lookup fails, that dimension resolves to an EMPTY list
 * — the user simply doesn't gain visibility into org/group records (never the
 * reverse). Visibility always still includes platform-scoped + owned records, so
 * a resolver outage degrades to the pre-isolation baseline, never a leak.
 * Results are cached briefly per user to keep record listing cheap.
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const { createLogger } = require('@exprsn/shared');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const { getInternalHttpsAgent } = require('@exprsn/shared/utils/httpAgent');

const logger = createLogger('exprsn-lowcode-membership');

const CACHE_TTL_MS = Number(process.env.LOWCODE_MEMBERSHIP_CACHE_MS || 30000);
const cache = new Map(); // userId → { at, orgIds, groupIds }

function base(envUrl, fallbackPath) {
  return process.env[envUrl] || `${process.env.PUBLIC_BASE_URL || 'https://localhost:8443'}${fallbackPath}`;
}
function serviceHeaders() {
  const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME || 'platform';
  return { 'X-Service-ID': serviceId, 'X-Service-Token': deriveServiceToken(serviceId) };
}
async function fetchIds(url, key) {
  try {
    const { data } = await axios.get(url, { timeout: 4000, headers: serviceHeaders(), httpsAgent: getInternalHttpsAgent() });
    const ids = data && data[key];
    return Array.isArray(ids) ? ids : [];
  } catch (err) {
    logger.warn('Membership lookup failed — treating as no memberships (secure-fail-empty)', { url, error: err.message });
    return [];
  }
}

/** Resolve { orgIds, groupIds } for a user. Best-effort + cached. */
async function resolveMemberships(userId) {
  if (!userId) return { orgIds: [], groupIds: [] };
  const hit = cache.get(userId);
  if (hit && (Date.now() - hit.at) < CACHE_TTL_MS) return { orgIds: hit.orgIds, groupIds: hit.groupIds };
  const [orgIds, groupIds] = await Promise.all([
    fetchIds(`${base('AUTH_SERVICE_URL', '/auth')}/api/internal/users/${userId}/orgs`, 'orgIds'),
    fetchIds(`${base('NEXUS_SERVICE_URL', '/nexus')}/api/internal/users/${userId}/groups`, 'groupIds'),
  ]);
  cache.set(userId, { at: Date.now(), orgIds, groupIds });
  return { orgIds, groupIds };
}

module.exports = { resolveMemberships, _cache: cache };
