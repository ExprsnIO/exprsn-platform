/**
 * ═══════════════════════════════════════════════════════════
 * CA Token Validation Utility
 * Validates CA tokens from TOKEN_SPECIFICATION_V1.0.md
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const forge = require('node-forge');
const fs = require('fs');
const config = require('../config');
const logger = require('./logger');
const cache = require('./cache');

class TokenValidation {
  constructor() {
    this.caServiceUrl = config.ca.caServiceUrl;
    this.rootCertPath = config.ca.rootCertPath;
    this.rootCert = null;

    // Load root certificate if available
    if (fs.existsSync(this.rootCertPath)) {
      try {
        const certPem = fs.readFileSync(this.rootCertPath, 'utf8');
        this.rootCert = forge.pki.certificateFromPem(certPem);
        logger.info('CA root certificate loaded');
      } catch (error) {
        logger.error('Failed to load CA root certificate', { error: error.message });
      }
    }
  }

  /**
   * Validate CA token
   * See TOKEN_SPECIFICATION_V1.0.md Section 9
   *
   * @param {string} tokenString - Token string to validate
   * @param {Object} requirements - Validation requirements
   * @returns {Promise<Object>} Validation result
   */
  async validateToken(tokenString, requirements = {}) {
    try {
      // Parse token
      const token = this._parseToken(tokenString);

      if (!token) {
        return {
          valid: false,
          error: 'INVALID_TOKEN_FORMAT',
          message: 'Token format is invalid'
        };
      }

      // Check cache for validation result
      const cacheKey = `token:validation:${token.id}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        const cachedResult = JSON.parse(cached);
        // Still check permissions against requirements
        if (this._checkPermissions(cachedResult.token, requirements)) {
          return cachedResult;
        }
      }

      // 1. Verify token structure
      const structureCheck = this._verifyStructure(token);
      if (!structureCheck.valid) {
        return structureCheck;
      }

      // 2. Check expiration
      const expirationCheck = this._checkExpiration(token);
      if (!expirationCheck.valid) {
        return expirationCheck;
      }

      // 3. Verify checksum
      const checksumCheck = this._verifyChecksum(token);
      if (!checksumCheck.valid) {
        return checksumCheck;
      }

      // 4. Verify signature (call CA service or verify locally)
      const signatureCheck = await this._verifySignature(token);
      if (!signatureCheck.valid) {
        return signatureCheck;
      }

      // 5. Check certificate status via OCSP
      const ocspCheck = await this._checkOCSP(token.certificateSerial);
      if (!ocspCheck.valid) {
        return ocspCheck;
      }

      // 6. Check permissions
      const permissionCheck = this._checkPermissions(token, requirements);
      if (!permissionCheck) {
        return {
          valid: false,
          error: 'INSUFFICIENT_PERMISSIONS',
          message: 'Token does not have required permissions'
        };
      }

      // 7. Check resource access
      if (requirements.resource) {
        const resourceCheck = this._checkResource(token, requirements.resource);
        if (!resourceCheck) {
          return {
            valid: false,
            error: 'RESOURCE_ACCESS_DENIED',
            message: 'Token does not grant access to this resource'
          };
        }
      }

      // Token is valid
      const result = {
        valid: true,
        token: {
          id: token.id,
          userId: token.userId,
          issuer: token.issuer,
          permissions: token.permissions,
          resource: token.resource,
          expiresAt: token.expiresAt,
          data: token.data
        }
      };

      // Cache validation result for 1 minute
      await cache.set(cacheKey, JSON.stringify(result), 60);

      return result;

    } catch (error) {
      logger.error('Token validation error', { error: error.message });
      return {
        valid: false,
        error: 'VALIDATION_ERROR',
        message: `Validation failed: ${error.message}`
      };
    }
  }

  /**
   * Extract token from Authorization header
   * @param {Object} req - Express request object
   * @returns {string|null} Token string
   */
  extractToken(req) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return null;
    }

    // Bearer token format
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // X-CA-Token header (alternative)
    const caTokenHeader = req.headers['x-ca-token'];
    if (caTokenHeader) {
      return caTokenHeader;
    }

    return null;
  }

  /**
   * Parse token string to object
   */
  _parseToken(tokenString) {
    try {
      // Token is base64-encoded JSON
      const decoded = Buffer.from(tokenString, 'base64').toString('utf8');
      const token = JSON.parse(decoded);
      return token;
    } catch (error) {
      logger.debug('Token parsing failed', { error: error.message });
      return null;
    }
  }

  /**
   * Verify token structure
   */
  _verifyStructure(token) {
    const requiredFields = [
      'id',
      'version',
      'userId',
      'issuer',
      'permissions',
      'resource',
      'issuedAt',
      'expiresAt',
      'checksum',
      'signature'
    ];

    for (const field of requiredFields) {
      if (!(field in token)) {
        return {
          valid: false,
          error: 'INVALID_TOKEN_STRUCTURE',
          message: `Missing required field: ${field}`
        };
      }
    }

    // Check version
    if (token.version !== '1.0') {
      return {
        valid: false,
        error: 'UNSUPPORTED_TOKEN_VERSION',
        message: `Unsupported token version: ${token.version}`
      };
    }

    return { valid: true };
  }

  /**
   * Check token expiration
   */
  _checkExpiration(token) {
    const now = Date.now();

    // Check notBefore
    if (token.notBefore && now < token.notBefore) {
      return {
        valid: false,
        error: 'TOKEN_NOT_YET_VALID',
        message: 'Token is not yet valid'
      };
    }

    // Check expiresAt
    if (token.expiresAt && now > token.expiresAt) {
      return {
        valid: false,
        error: 'TOKEN_EXPIRED',
        message: 'Token has expired'
      };
    }

    // Check use count
    if (token.expiryType === 'use') {
      if (token.usesRemaining !== undefined && token.usesRemaining <= 0) {
        return {
          valid: false,
          error: 'TOKEN_USE_LIMIT_EXCEEDED',
          message: 'Token has no remaining uses'
        };
      }
    }

    return { valid: true };
  }

  /**
   * Verify token checksum
   */
  _verifyChecksum(token) {
    try {
      // Reconstruct token data for checksum verification
      const dataForChecksum = {
        id: token.id,
        version: token.version,
        userId: token.userId,
        issuer: token.issuer,
        permissions: token.permissions,
        resource: token.resource,
        issuedAt: token.issuedAt,
        notBefore: token.notBefore,
        expiresAt: token.expiresAt
      };

      const dataString = JSON.stringify(dataForChecksum);
      const crypto = require('crypto');
      const calculatedChecksum = crypto
        .createHash('sha256')
        .update(dataString)
        .digest('hex');

      if (calculatedChecksum !== token.checksum) {
        return {
          valid: false,
          error: 'INVALID_CHECKSUM',
          message: 'Token checksum verification failed'
        };
      }

      return { valid: true };

    } catch (error) {
      return {
        valid: false,
        error: 'CHECKSUM_VERIFICATION_ERROR',
        message: `Checksum verification error: ${error.message}`
      };
    }
  }

  /**
   * Verify token signature
   */
  async _verifySignature(token) {
    try {
      // For now, delegate to CA service for signature verification
      // In production, could verify locally with cached certificates
      const response = await axios.post(
        `${this.caServiceUrl}/api/tokens/verify-signature`,
        {
          tokenId: token.id,
          signature: token.signature,
          checksum: token.checksum
        },
        { timeout: 5000 }
      );

      if (response.data.valid) {
        return { valid: true };
      } else {
        return {
          valid: false,
          error: 'INVALID_SIGNATURE',
          message: 'Token signature verification failed'
        };
      }

    } catch (error) {
      logger.error('Signature verification failed', { error: error.message });
      return {
        valid: false,
        error: 'SIGNATURE_VERIFICATION_ERROR',
        message: `Signature verification error: ${error.message}`
      };
    }
  }

  /**
   * Check certificate status via OCSP
   */
  async _checkOCSP(certificateSerial) {
    try {
      // Check cache first
      const cacheKey = `ocsp:${certificateSerial}`;
      const cached = await cache.get(cacheKey);

      if (cached) {
        const status = JSON.parse(cached);
        if (status === 'good') {
          return { valid: true };
        } else {
          return {
            valid: false,
            error: 'CERTIFICATE_REVOKED',
            message: 'Certificate has been revoked'
          };
        }
      }

      // Query OCSP responder
      const response = await axios.post(
        `${this.caServiceUrl}/ocsp`,
        {
          certificateSerial
        },
        {
          headers: { 'Content-Type': 'application/ocsp-request' },
          timeout: 5000
        }
      );

      const status = response.data.certificateStatus || 'unknown';

      // Cache result for 5 minutes
      await cache.set(cacheKey, JSON.stringify(status), 300);

      if (status === 'good') {
        return { valid: true };
      } else {
        return {
          valid: false,
          error: 'CERTIFICATE_REVOKED',
          message: `Certificate status: ${status}`
        };
      }

    } catch (error) {
      logger.warn('OCSP check failed', { error: error.message });
      // In production, might want to fail closed
      // For now, allow if OCSP is unavailable
      return { valid: true };
    }
  }

  /**
   * Check if token has required permissions
   */
  _checkPermissions(token, requirements) {
    if (!requirements.requiredPermissions) {
      return true;
    }

    const required = requirements.requiredPermissions;
    const tokenPerms = token.permissions;

    for (const [perm, value] of Object.entries(required)) {
      if (value && !tokenPerms[perm]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if token grants access to resource
   */
  _checkResource(token, requestedResource) {
    const tokenResource = token.resource;

    if (!tokenResource) {
      return false;
    }

    // Exact match
    if (tokenResource.value === requestedResource) {
      return true;
    }

    // Wildcard matching for URL resources
    if (tokenResource.type === 'url') {
      const pattern = tokenResource.value.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(requestedResource);
    }

    return false;
  }
}

module.exports = new TokenValidation();
