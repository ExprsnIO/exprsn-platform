/**
 * ═══════════════════════════════════════════════════════════
 * Cross-module Group Membership Guard
 *
 * Reusable Express middleware that authorizes a request against a group's
 * membership, resolved from nexus (the owner of the group model) via its
 * internal service-to-service endpoint:
 *
 *   GET <NEXUS>/api/internal/groups/:groupId/membership/:userId
 *
 * The call is authenticated with the per-service HMAC credential
 * (X-Service-ID / X-Service-Token derived from SERVICE_TOKEN_SECRET), NOT the
 * end user's CA token. Results are cached in Redis with a short TTL, mirroring
 * the CA-token validation cache other modules use.
 *
 * Usage:
 *   const { requireGroupMembership } = require('@exprsn/shared');
 *   router.post('/groups/:groupId/posts', requireToken(), requireGroupMembership(),            handler);
 *   router.delete('/groups/:groupId/posts/:id', requireToken(), requireGroupMembership('moderator'), handler);
 *
 * Requires an authenticated user on the request first (req.userId or
 * req.user.id), e.g. via the CA-token middleware. On success it attaches
 * req.groupMembership = { isMember, role, visibility, joinMode }.
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const { createClient } = require('redis');
const logger = require('../utils/logger');
const { deriveServiceToken } = require('../utils/serviceToken');
const { getInternalHttpsAgent } = require('../utils/httpAgent');

// Role hierarchy for minimum-role checks (higher rank satisfies lower).
const ROLE_RANK = { member: 1, moderator: 2, admin: 3, owner: 4 };

// Short TTL — membership/role changes should propagate quickly.
const CACHE_TTL_SECONDS = 30;

let redisClient = null;
let redisDisabled = false;

/**
 * Lazily connect a best-effort Redis client for caching. If Redis is
 * unavailable the guard degrades to calling nexus on every request rather
 * than failing.
 * @returns {Promise<Object|null>} connected client or null
 */
async function getRedis() {
  if (redisDisabled) return null;
  if (redisClient && redisClient.isOpen) return redisClient;

  try {
    redisClient = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
      password: process.env.REDIS_PASSWORD || undefined,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500)
      }
    });
    redisClient.on('error', (err) => {
      logger.warn('requireGroupMembership: Redis error', { error: err.message });
    });
    await redisClient.connect();
    return redisClient;
  } catch (error) {
    redisDisabled = true;
    logger.warn('requireGroupMembership: Redis unavailable, proceeding without cache', {
      error: error.message
    });
    return null;
  }
}

/**
 * Resolve the nexus base URL (gateway loopback in the consolidated platform).
 * @returns {string}
 */
function nexusBaseUrl() {
  return (process.env.NEXUS_SERVICE_URL || 'https://localhost:8443/nexus').replace(/\/$/, '');
}

/**
 * The identity-bound service credentials this process presents.
 * @returns {{serviceId: string, headers: Object}}
 */
function serviceCredentials() {
  const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME || 'platform';
  return {
    serviceId,
    headers: {
      'X-Service-ID': serviceId,
      'X-Service-Token': deriveServiceToken(serviceId)
    }
  };
}

/**
 * Resolve a user's membership in a group, using the Redis cache when available.
 * @param {string} groupId
 * @param {string} userId
 * @returns {Promise<Object>} { isMember, role, visibility, joinMode } or
 *   { _error: 'not_found' | 'unavailable' }
 */
async function resolveMembership(groupId, userId) {
  const cacheKey = `nexus:membership:${groupId}:${userId}`;
  const redis = await getRedis();

  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (error) {
      logger.warn('requireGroupMembership: cache read failed', { error: error.message });
    }
  }

  try {
    const { headers } = serviceCredentials();
    const url = `${nexusBaseUrl()}/api/internal/groups/${encodeURIComponent(groupId)}/membership/${encodeURIComponent(userId)}`;
    const response = await axios.get(url, {
      headers,
      timeout: 5000,
      httpsAgent: getInternalHttpsAgent()
    });

    const result = {
      isMember: !!response.data.isMember,
      role: response.data.role || null,
      visibility: response.data.visibility || null,
      joinMode: response.data.joinMode || null
    };

    if (redis) {
      try {
        await redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
      } catch (error) {
        logger.warn('requireGroupMembership: cache write failed', { error: error.message });
      }
    }

    return result;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return { _error: 'not_found' };
    }
    logger.error('requireGroupMembership: nexus lookup failed', {
      groupId,
      userId,
      status: error.response && error.response.status,
      error: error.message
    });
    return { _error: 'unavailable' };
  }
}

/**
 * Express middleware factory: require the authenticated user to be a member of
 * the group (optionally with a minimum role).
 *
 * @param {string|null} minRole - Minimum role required
 *   (member < moderator < admin < owner). Omit to require membership only.
 * @returns {Function} Express middleware
 */
function requireGroupMembership(minRole = null) {
  if (minRole && !ROLE_RANK[minRole]) {
    throw new Error(`requireGroupMembership: unknown role '${minRole}'`);
  }

  return async (req, res, next) => {
    try {
      const groupId = req.params.groupId || req.params.id || (req.body && req.body.groupId);
      const userId = req.userId || (req.user && req.user.id);

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Authentication required'
        });
      }

      if (!groupId) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'groupId is required'
        });
      }

      const membership = await resolveMembership(groupId, userId);

      if (membership._error === 'not_found') {
        return res.status(404).json({
          error: 'GROUP_NOT_FOUND',
          message: 'Group not found'
        });
      }

      if (membership._error === 'unavailable') {
        return res.status(503).json({
          error: 'MEMBERSHIP_SERVICE_UNAVAILABLE',
          message: 'Unable to verify group membership'
        });
      }

      if (!membership.isMember) {
        return res.status(403).json({
          error: 'NOT_GROUP_MEMBER',
          message: 'You must be a member of this group'
        });
      }

      if (minRole) {
        const have = ROLE_RANK[membership.role] || 0;
        if (have < ROLE_RANK[minRole]) {
          return res.status(403).json({
            error: 'INSUFFICIENT_ROLE',
            message: `Required role: ${minRole} or higher`,
            required: minRole,
            actual: membership.role
          });
        }
      }

      req.groupMembership = membership;
      next();
    } catch (error) {
      logger.error('requireGroupMembership error', { error: error.message });
      return res.status(500).json({
        error: 'MEMBERSHIP_CHECK_ERROR',
        message: 'An error occurred while checking group membership'
      });
    }
  };
}

module.exports = {
  requireGroupMembership,
  // exported for tests / advanced callers
  resolveMembership,
  ROLE_RANK
};
