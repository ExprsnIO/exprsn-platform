/**
 * CA Token Validator - Shared Utility
 * Validates tokens issued by exprsn-ca across all services
 *
 * Implements TOKEN_SPECIFICATION_V1.0.md Section 9: Token Validation
 */

const axios = require('axios');
const crypto = require('crypto');

/**
 * Refuse plaintext token-validation URLs in production
 * @param {string} url - CA validation URL
 * @returns {string} The validated URL
 */
function assertSecureCaUrl(url) {
  if (process.env.NODE_ENV === 'production' && /^http:\/\//i.test(url)) {
    throw new Error(
      `Refusing to validate tokens over plaintext HTTP in production: ${url}. ` +
      'Configure an https:// CA URL.'
    );
  }
  return url;
}

/**
 * Match a resource against a literal glob pattern ('*' wildcards only).
 * Pattern segments are matched by sequential indexOf scanning — no regex is
 * ever compiled from user-controlled input (avoids ReDoS/regex injection).
 * @param {string} resource - Resource string to test
 * @param {string} pattern - Glob pattern (e.g. 'https://api.exprsn.io/*')
 * @returns {boolean} True if the resource matches the pattern
 */
function matchesGlob(resource, pattern) {
  if (typeof resource !== 'string' || typeof pattern !== 'string') return false;

  const segments = pattern.split('*');

  // No wildcard: exact literal match
  if (segments.length === 1) {
    return resource === pattern;
  }

  // Anchor: must start with the first literal segment
  if (!resource.startsWith(segments[0])) return false;
  let pos = segments[0].length;

  // Middle segments: each must appear in order after the previous match
  for (let i = 1; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (seg === '') continue; // consecutive '*' — matches anything
    const idx = resource.indexOf(seg, pos);
    if (idx === -1) return false;
    pos = idx + seg.length;
  }

  // Anchor: must end with the last literal segment (at/after current position)
  const last = segments[segments.length - 1];
  if (last === '') return true; // trailing '*' matches rest
  return resource.length - last.length >= pos && resource.endsWith(last);
}

class CATokenValidator {
  constructor(options = {}) {
    this.caBaseUrl = assertSecureCaUrl(
      options.caBaseUrl || process.env.CA_BASE_URL || 'http://localhost:3000'
    );
    this.ocspEnabled = options.ocspEnabled !== false;
    this.cacheEnabled = options.cacheEnabled !== false;
    this.cacheTTL = options.cacheTTL || 300000; // 5 minutes
    this.cache = new Map();

    // Service identity for service-to-service authentication.
    // Prefer the identity-bound derived token; fall back to an
    // explicitly provided token, then the legacy shared SERVICE_TOKEN.
    this.serviceId = options.serviceId || process.env.SERVICE_ID;
    this.serviceToken = options.serviceToken || null;

    if (!this.serviceToken && this.serviceId) {
      try {
        const { deriveServiceToken } = require('./serviceToken');
        this.serviceToken = deriveServiceToken(this.serviceId);
      } catch (error) {
        console.warn(
          `Falling back to legacy SERVICE_TOKEN for CA calls (service: ${this.serviceId}): ${error.message}`
        );
        this.serviceToken = process.env.SERVICE_TOKEN || null;
      }
    }
  }

  /**
   * Validate a CA token
   * @param {string} token - Token ID to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result
   */
  async validateToken(token, options = {}) {
    const {
      requiredPermissions = {},
      resource = null
    } = options;

    try {
      // Check cache first
      if (this.cacheEnabled) {
        const cached = this.getFromCache(token);
        if (cached && cached.valid) {
          return this.checkPermissions(cached, requiredPermissions, resource);
        }
      }

      // Validate with CA service. The CA's /api/tokens/validate accepts a
      // service-to-service `token` (the bearer/token-id) plus optional
      // `requiredPermissions` and `resource`, and REJECTS unknown keys and a
      // null `resource` (Joi). Send only the fields it recognizes, and only
      // when set — otherwise the request fails with "Invalid input data".
      const body = { token };
      if (requiredPermissions && Object.keys(requiredPermissions).length > 0) {
        body.requiredPermissions = requiredPermissions;
      }
      if (resource) {
        body.resource = resource;
      }

      const response = await axios.post(
        `${this.caBaseUrl}/api/tokens/validate`,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Service-ID': this.serviceId,
            'X-Service-Token': this.serviceToken
          },
          timeout: 5000
        }
      );

      const validationResult = response.data;

      // Cache successful validation
      if (this.cacheEnabled && validationResult.valid) {
        this.addToCache(token, validationResult);
      }

      // Check permissions
      return this.checkPermissions(validationResult, requiredPermissions, resource);

    } catch (error) {
      if (error.response) {
        return {
          valid: false,
          error: error.response.data.error || 'TOKEN_VALIDATION_FAILED',
          message: error.response.data.message || 'Token validation failed'
        };
      }

      return {
        valid: false,
        error: 'CA_UNAVAILABLE',
        message: 'Unable to connect to Certificate Authority',
        details: error.message
      };
    }
  }

  /**
   * Check if token has required permissions
   * @param {Object} validationResult - Result from CA validation
   * @param {Object} requiredPermissions - Required permissions
   * @param {string} resource - Resource being accessed
   * @returns {Object} Enhanced validation result
   */
  checkPermissions(validationResult, requiredPermissions, resource) {
    if (!validationResult.valid) {
      return validationResult;
    }

    const tokenPermissions = validationResult.permissions || {};
    const hasPermissions = Object.entries(requiredPermissions).every(
      ([perm, required]) => !required || tokenPermissions[perm]
    );

    if (!hasPermissions) {
      return {
        valid: false,
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'Token does not have required permissions',
        required: requiredPermissions,
        granted: tokenPermissions
      };
    }

    // Check resource scope
    if (resource && validationResult.resourcePattern) {
      const resourceMatches = this.matchesResourcePattern(
        resource,
        validationResult.resourcePattern,
        validationResult.resourceType
      );

      if (!resourceMatches) {
        return {
          valid: false,
          error: 'RESOURCE_NOT_AUTHORIZED',
          message: 'Token is not authorized for this resource',
          resource,
          allowedPattern: validationResult.resourcePattern
        };
      }
    }

    return {
      ...validationResult,
      valid: true,
      authorized: true
    };
  }

  /**
   * Check if resource matches token's resource pattern
   * @param {string} resource - Resource being accessed
   * @param {string} pattern - Token's resource pattern
   * @param {string} type - Resource type (url, did, cid)
   * @returns {boolean} True if resource matches pattern
   */
  matchesResourcePattern(resource, pattern, type) {
    if (type === 'url') {
      // Literal glob match ('*' wildcards) — never compiles user input to regex
      return matchesGlob(resource, pattern);
    }

    // For DID and CID, exact match or prefix match
    return resource === pattern || resource.startsWith(pattern);
  }

  /**
   * Get validation result from cache
   * @param {string} token - Token ID
   * @returns {Object|null} Cached result or null
   */
  getFromCache(token) {
    const cached = this.cache.get(token);
    if (!cached) return null;

    // Check if cache is expired
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(token);
      return null;
    }

    return cached.data;
  }

  /**
   * Add validation result to cache
   * @param {string} token - Token ID
   * @param {Object} data - Validation result
   */
  addToCache(token, data) {
    this.cache.set(token, {
      data,
      expiresAt: Date.now() + this.cacheTTL
    });

    // Limit cache size
    if (this.cache.size > 10000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  /**
   * Clear validation cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Extract token from Authorization header
   * @param {string} authHeader - Authorization header value
   * @returns {string|null} Token ID or null
   */
  static extractToken(authHeader) {
    if (!authHeader) return null;

    // Support both "Bearer <token>" and "CA-Token <token>" formats
    const match = authHeader.match(/^(Bearer|CA-Token)\s+(.+)$/i);
    return match ? match[2] : null;
  }

  /**
   * Generate service-to-service authentication token
   * This is used when one service calls another service
   * @param {string} targetService - Target service identifier
   * @param {Array<string>} permissions - Required permissions
   * @returns {Promise<string>} Service token
   */
  async generateServiceToken(targetService, permissions = []) {
    try {
      const response = await axios.post(
        `${this.caBaseUrl}/api/tokens/generate`,
        {
          serviceId: this.serviceId,
          targetService,
          permissions: {
            read: permissions.includes('read'),
            write: permissions.includes('write'),
            delete: permissions.includes('delete'),
            append: permissions.includes('append'),
            update: permissions.includes('update')
          },
          resourceType: 'url',
          resourceValue: `service://${targetService}/*`,
          expiryType: 'time',
          expirySeconds: 3600 // 1 hour
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Service-ID': this.serviceId,
            'X-Service-Token': this.serviceToken
          }
        }
      );

      return response.data.tokenId;
    } catch (error) {
      throw new Error(`Failed to generate service token: ${error.message}`);
    }
  }

  /**
   * Validate user has specific group membership
   * @param {string} userId - User ID
   * @param {Array<string>} requiredGroups - Required group IDs
   * @returns {Promise<boolean>} True if user is in any required group
   */
  async checkGroupMembership(userId, requiredGroups = []) {
    if (!requiredGroups.length) return true;

    try {
      const response = await axios.get(
        `${this.caBaseUrl}/api/users/${userId}/groups`,
        {
          headers: {
            'X-Service-ID': this.serviceId,
            'X-Service-Token': this.serviceToken
          }
        }
      );

      const userGroups = response.data.groups || [];
      return requiredGroups.some(reqGroup =>
        userGroups.some(userGroup => userGroup.id === reqGroup)
      );
    } catch (error) {
      console.error('Failed to check group membership:', error.message);
      return false;
    }
  }

  /**
   * Get user's effective permissions (from groups and roles)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User's permissions
   */
  async getUserPermissions(userId) {
    try {
      const response = await axios.get(
        `${this.caBaseUrl}/api/users/${userId}/permissions`,
        {
          headers: {
            'X-Service-ID': this.serviceId,
            'X-Service-Token': this.serviceToken
          }
        }
      );

      return response.data.permissions || {};
    } catch (error) {
      console.error('Failed to get user permissions:', error.message);
      return {};
    }
  }
}

/**
 * Singleton instance
 */
let instance = null;

/**
 * Get or create validator instance
 * @param {Object} options - Validator options
 * @returns {CATokenValidator} Validator instance
 */
function getValidator(options = {}) {
  if (!instance) {
    instance = new CATokenValidator(options);
  }
  return instance;
}

module.exports = {
  CATokenValidator,
  getValidator,
  matchesGlob,
  assertSecureCaUrl
};
