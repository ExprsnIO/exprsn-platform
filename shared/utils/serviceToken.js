/**
 * ═══════════════════════════════════════════════════════════
 * Service-to-Service Token Utilities
 * Helpers for generating and managing tokens for intercommunication
 * See: TOKEN_SPECIFICATION_V1.0.md Section 8 & 9
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const crypto = require('crypto');
const logger = require('./logger');

/**
 * ───────────────────────────────────────────────────────────
 * Per-service identity-bound tokens
 *
 * Each service's wire token is derived as
 *   HMAC-SHA256(serviceId, SERVICE_TOKEN_SECRET) (hex)
 * which binds the X-Service-ID header to the credential. The receiving side
 * recomputes the HMAC for the claimed service id and compares in constant
 * time, so one service's token cannot be replayed under another identity.
 * ───────────────────────────────────────────────────────────
 */

const SECRET_PLACEHOLDER = /^change_me/i;

/**
 * Whether the legacy shared static SERVICE_TOKEN is still accepted.
 * Explicit opt-in only.
 */
function isLegacyServiceTokenAllowed() {
  return process.env.SERVICE_TOKEN_LEGACY_ALLOW === 'true';
}

/**
 * Get SERVICE_TOKEN_SECRET, enforcing strength requirements.
 * @param {Object} options
 * @param {boolean} options.optional - Return null instead of throwing when invalid
 * @returns {string|null} The secret
 * @throws {Error} If the secret is unset, a placeholder, or too short
 */
function getServiceTokenSecret(options = {}) {
  const secret = process.env.SERVICE_TOKEN_SECRET;
  const valid = typeof secret === 'string' &&
    secret.length >= 32 &&
    !SECRET_PLACEHOLDER.test(secret);

  if (valid) return secret;

  if (options.optional) return null;

  throw new Error(
    'SERVICE_TOKEN_SECRET must be set to a non-placeholder value of at least 32 characters. ' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}

/**
 * Constant-time string comparison
 */
function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Derive the identity-bound token for a service id.
 * @param {string} serviceId - Service identifier (e.g. 'timeline')
 * @returns {string} Hex HMAC-SHA256 token
 */
function deriveServiceToken(serviceId) {
  if (!serviceId) {
    throw new Error('serviceId is required to derive a service token');
  }
  return crypto
    .createHmac('sha256', getServiceTokenSecret())
    .update(String(serviceId))
    .digest('hex');
}

/**
 * Verify that a presented token matches the claimed service id.
 * Falls back to the legacy shared SERVICE_TOKEN only when
 * SERVICE_TOKEN_LEGACY_ALLOW === 'true'.
 * @param {string} serviceId - Claimed service id (X-Service-ID)
 * @param {string} providedToken - Presented token (X-Service-Token)
 * @returns {boolean} True if the token is bound to the claimed identity
 */
function verifyServiceToken(serviceId, providedToken) {
  if (!serviceId || !providedToken) return false;

  // When legacy mode is on, a missing/weak secret falls through to the
  // legacy comparison instead of throwing.
  const secret = getServiceTokenSecret({ optional: isLegacyServiceTokenAllowed() });

  if (secret) {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(String(serviceId))
      .digest('hex');

    if (timingSafeStringEqual(providedToken, expected)) {
      return true;
    }
  }

  if (isLegacyServiceTokenAllowed() && process.env.SERVICE_TOKEN) {
    if (timingSafeStringEqual(providedToken, process.env.SERVICE_TOKEN)) {
      logger.warn('Service authenticated using LEGACY shared SERVICE_TOKEN', {
        serviceId,
        migration: 'Set SERVICE_TOKEN_SECRET and remove SERVICE_TOKEN_LEGACY_ALLOW'
      });
      return true;
    }
  }

  return false;
}

/**
 * Generate a service token for calling another Exprsn service
 * @param {Object} params - Token generation parameters
 * @param {string} params.certificateId - Service certificate ID
 * @param {Object} params.permissions - Required permissions {read, write, append, delete, update}
 * @param {string} params.resourceType - Resource type ('url', 'did', 'cid')
 * @param {string} params.resourceValue - Resource value (e.g., 'https://api.exprsn.io/*')
 * @param {string} params.expiryType - Expiry type ('time', 'use', 'persistent')
 * @param {number} params.expirySeconds - Expiry time in seconds (default: 3600)
 * @param {number} params.maxUses - Max uses for use-based tokens
 * @param {Object} params.data - Custom token data
 * @param {string} caUrl - CA service URL
 * @param {string} authToken - Authentication token for CA
 * @returns {Promise<Object>} Generated token
 */
async function generateServiceToken(params, caUrl = process.env.CA_URL || 'http://localhost:3000', authToken) {
  try {
    const {
      certificateId,
      permissions = { read: true },
      resourceType = 'url',
      resourceValue,
      expiryType = 'time',
      expirySeconds = 3600,
      maxUses,
      data = {}
    } = params;

    if (!certificateId) {
      throw new Error('certificateId is required');
    }

    if (!resourceValue) {
      throw new Error('resourceValue is required');
    }

    const requestBody = {
      certificateId,
      permissions,
      resourceType,
      resourceValue,
      expiryType,
      data
    };

    if (expiryType === 'time') {
      requestBody.expirySeconds = expirySeconds;
    } else if (expiryType === 'use') {
      requestBody.maxUses = maxUses || 1;
    }

    const headers = {
      'Content-Type': 'application/json'
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await axios.post(
      `${caUrl}/api/tokens/generate`,
      requestBody,
      {
        timeout: 10000,
        headers
      }
    );

    if (!response.data.success || !response.data.token) {
      throw new Error('Token generation failed: ' + JSON.stringify(response.data));
    }

    logger.info('Service token generated', {
      tokenId: response.data.token.id,
      resourceType,
      resourceValue
    });

    return response.data.token;

  } catch (error) {
    logger.error('Failed to generate service token', {
      error: error.message,
      params
    });

    if (error.response) {
      throw new Error(`CA service error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }

    throw error;
  }
}

/**
 * Create a service-to-service request with token
 * @param {Object} params - Request parameters
 * @param {string} params.method - HTTP method (GET, POST, etc.)
 * @param {string} params.url - Target service URL
 * @param {Object} params.data - Request body
 * @param {Object} params.headers - Additional headers
 * @param {string} params.token - CA token (as string or object)
 * @param {number} params.timeout - Request timeout (default: 10000ms)
 * @returns {Promise<Object>} Response data
 */
async function serviceRequest(params) {
  const {
    method = 'GET',
    url,
    data,
    headers = {},
    token,
    timeout = 10000
  } = params;

  if (!url) {
    throw new Error('URL is required');
  }

  if (!token) {
    throw new Error('Token is required for service requests');
  }

  // Convert token to string if it's an object
  let tokenString = token;
  if (typeof token === 'object') {
    tokenString = JSON.stringify(token);
  }

  const requestHeaders = {
    ...headers,
    'Authorization': `Bearer ${tokenString}`,
    'Content-Type': 'application/json',
    'X-Service-Request': 'true'
  };

  try {
    const response = await axios({
      method,
      url,
      data,
      headers: requestHeaders,
      timeout
    });

    return response.data;

  } catch (error) {
    logger.error('Service request failed', {
      method,
      url,
      status: error.response?.status,
      error: error.response?.data || error.message
    });

    throw error;
  }
}

/**
 * Generate a token for a specific service endpoint
 * @param {Object} params - Parameters
 * @param {string} params.serviceUrl - Target service URL
 * @param {string} params.endpoint - Endpoint path
 * @param {Object} params.permissions - Required permissions
 * @param {number} params.expirySeconds - Token expiry (default: 3600)
 * @param {string} certificateId - Service certificate ID
 * @param {string} caUrl - CA service URL
 * @param {string} authToken - Auth token for CA
 * @returns {Promise<Object>} Generated token
 */
async function generateEndpointToken(params, certificateId, caUrl, authToken) {
  const { serviceUrl, endpoint, permissions = { read: true }, expirySeconds = 3600 } = params;

  if (!serviceUrl || !endpoint) {
    throw new Error('serviceUrl and endpoint are required');
  }

  // Construct full resource URL
  const resourceValue = `${serviceUrl.replace(/\/$/, '')}${endpoint}`;

  return generateServiceToken(
    {
      certificateId,
      permissions,
      resourceType: 'url',
      resourceValue,
      expiryType: 'time',
      expirySeconds,
      data: {
        service: serviceUrl,
        endpoint,
        generatedAt: Date.now()
      }
    },
    caUrl,
    authToken
  );
}

/**
 * Generate a wildcard token for an entire service
 * @param {Object} params - Parameters
 * @param {string} params.serviceUrl - Target service URL
 * @param {Object} params.permissions - Required permissions
 * @param {number} params.expirySeconds - Token expiry (default: 7200)
 * @param {string} certificateId - Service certificate ID
 * @param {string} caUrl - CA service URL
 * @param {string} authToken - Auth token for CA
 * @returns {Promise<Object>} Generated token
 */
async function generateServiceWildcardToken(params, certificateId, caUrl, authToken) {
  const { serviceUrl, permissions = { read: true }, expirySeconds = 7200 } = params;

  if (!serviceUrl) {
    throw new Error('serviceUrl is required');
  }

  // Add wildcard for all endpoints
  const resourceValue = `${serviceUrl.replace(/\/$/, '')}/*`;

  return generateServiceToken(
    {
      certificateId,
      permissions,
      resourceType: 'url',
      resourceValue,
      expiryType: 'time',
      expirySeconds,
      data: {
        service: serviceUrl,
        wildcardToken: true,
        generatedAt: Date.now()
      }
    },
    caUrl,
    authToken
  );
}

/**
 * Cache for service tokens to avoid regenerating
 */
class ServiceTokenCache {
  constructor() {
    this.cache = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Cleanup every minute
    if (typeof this.cleanupInterval.unref === 'function') this.cleanupInterval.unref();
  }

  /**
   * Get cached token or generate new one
   * @param {string} key - Cache key
   * @param {Function} generator - Token generator function
   * @returns {Promise<Object>} Token
   */
  async getOrGenerate(key, generator) {
    const cached = this.cache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      logger.debug('Using cached service token', { key });
      return cached.token;
    }

    // Generate new token
    const token = await generator();

    // Cache with 90% of expiry time to ensure freshness
    const expiresAt = token.expiresAt
      ? token.expiresAt - (token.expiresAt - Date.now()) * 0.1
      : Date.now() + 3000000; // Default 50 minutes

    this.cache.set(key, { token, expiresAt });

    logger.debug('Cached new service token', { key, expiresAt });

    return token;
  }

  /**
   * Clean up expired tokens
   */
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (value.expiresAt <= now) {
        this.cache.delete(key);
        logger.debug('Removed expired token from cache', { key });
      }
    }
  }

  /**
   * Clear all cached tokens
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Destroy cache and cleanup interval
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

// Export singleton cache instance
const tokenCache = new ServiceTokenCache();

module.exports = {
  generateServiceToken,
  serviceRequest,
  generateEndpointToken,
  generateServiceWildcardToken,
  tokenCache,
  ServiceTokenCache,
  deriveServiceToken,
  verifyServiceToken,
  getServiceTokenSecret,
  isLegacyServiceTokenAllowed,
  timingSafeStringEqual
};
