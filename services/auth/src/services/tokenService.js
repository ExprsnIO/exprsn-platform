/**
 * ═══════════════════════════════════════════════════════════
 * Token Service
 * Generates and validates CA tokens
 * See: TOKEN_SPECIFICATION_V1.0.md Section 8 & 9
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const { logger } = require('@exprsn/shared');
const { isPlatformAdmin } = require('@exprsn/shared/utils/platformAdmin');
const config = require('../config');

// In-process CA integration. Both modules run in one process, so token minting
// calls the CA's token service directly instead of over HTTPS loopback (which
// required an interactive CA session and a self-signed cert). See
// memory: ca-token-issuance-blocker.
const caTokenService = require('../../../ca/services/token');
const { getSigningCertificateId } = require('../../../ca/services/platformSigning');

/**
 * Generate CA token for authenticated user
 * @param {Object} user - User object
 * @param {Object} options - Token generation options
 * @returns {Promise<string>} CA token
 */
async function generateToken(user, options = {}) {
  try {
    const {
      permissions = { read: true, write: true, append: true, update: true, delete: false },
      resourceType = 'url',
      // '/' is a prefix that the CA matcher (matchesResource) accepts for every
      // module path ('/timeline/...', '/spark/...'). NOTE: '*' would NOT work —
      // the CA matcher compiles '*' to a single-segment '[^/]*' and rejects
      // multi-segment paths.
      resourceValue = '/',
      expiryType = 'time',
      expirySeconds = config.tokenDefaults.expirySeconds
    } = options;

    // Get user groups to determine permissions
    const userGroups = await user.getGroups();

    // Get the user's RBAC roles. These are carried in the token data so that
    // role-based guards (shared requireAdmin → role === 'admin') can authorize
    // a *platform* admin in modules that only see the CA token (e.g. nexus's
    // platform-admin override for group management). Defensive: some callers may
    // pass a plain object without the Sequelize association mixin.
    let roleNames = [];
    try {
      if (typeof user.getRoles === 'function') {
        const userRoles = await user.getRoles();
        roleNames = (userRoles || []).map(r => r.name).filter(Boolean);
      }
    } catch (roleError) {
      logger.warn('Failed to resolve user roles for token data', {
        userId: user.id,
        error: roleError.message
      });
    }

    // Aggregate permissions from all groups
    let aggregatedPermissions = userGroups.reduce((acc, group) => {
      return {
        read: acc.read || group.permissions.read,
        write: acc.write || group.permissions.write,
        append: acc.append || group.permissions.append,
        delete: acc.delete || group.permissions.delete,
        update: acc.update || group.permissions.update
      };
    }, permissions);

    // Platform admins (PLATFORM_ADMIN_EMAILS) get the full permission set —
    // including delete — regardless of group membership, so they can act as
    // full admins across every module.
    if (isPlatformAdmin(user.email)) {
      aggregatedPermissions = {
        read: true,
        write: true,
        append: true,
        update: true,
        delete: true
      };
    }

    // Mint the token in-process via the CA token service. The bearer presented
    // to module APIs is the token id (the shared validator looks it up by id).
    const certificateId = await getSigningCertificateId();

    const token = await caTokenService.generateToken(
      {
        certificateId,
        permissions: aggregatedPermissions,
        resourceType,
        resourceValue,
        expiryType,
        expirySeconds,
        data: {
          // userId is read by some module middlewares from tokenData
          // (e.g. filevault: validation.token.data.userId); also surfaced
          // top-level by the CA validate response.
          userId: user.id,
          email: user.email,
          displayName: user.displayName,
          groups: userGroups.map(g => g.name),
          // RBAC role names (e.g. 'admin'); read by role-based guards that only
          // have the CA token to work with.
          roles: roleNames
        }
      },
      user.id,
      { isAdmin: true } // platform-trusted issuance; bypasses cert-ownership check
    );

    logger.info('CA token generated', { userId: user.id, tokenId: token.id });

    return token.id;
  } catch (error) {
    logger.error('Failed to generate CA token', {
      error: error.message,
      userId: user.id
    });

    throw new Error('Failed to generate authentication token');
  }
}

/**
 * Validate CA token
 * @param {string} token - Token to validate
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation result
 */
async function validateToken(token, options = {}) {
  try {
    const {
      requiredPermissions = { read: true },
      resource = null
    } = options;

    const response = await axios.post(
      `${config.ca.url}/api/tokens/validate`,
      {
        token,
        requiredPermissions,
        resource
      },
      {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Name': 'exprsn-auth'
        }
      }
    );

    return response.data;
  } catch (error) {
    logger.error('Token validation error', { error: error.message });
    throw error;
  }
}

/**
 * Revoke CA token (in-process).
 *
 * Both modules run in one process, so revoke calls the CA token service directly
 * — same as minting above — instead of over HTTPS loopback (which would require
 * service-auth headers the CA revoke route doesn't accept). `isAdmin: true` is
 * the platform-trusted path: it bypasses owner-scoping and clears the CA's redis
 * validation cache, so the very next validateToken sees the token as revoked.
 * @param {string} tokenId - Token ID to revoke
 * @param {string} reason - Revocation reason
 * @returns {Promise<void>}
 */
async function revokeToken(tokenId, reason = 'User logout') {
  try {
    await caTokenService.revokeToken(tokenId, reason, null, { isAdmin: true });
    logger.info('Token revoked', { tokenId, reason });
  } catch (error) {
    logger.error('Failed to revoke token', {
      error: error.message,
      tokenId
    });
    throw error;
  }
}

module.exports = {
  generateToken,
  validateToken,
  revokeToken
};
