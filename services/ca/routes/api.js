/**
 * ═══════════════════════════════════════════════════════════════════════
 * API Routes - Token Generation and Validation (Spec v1.0)
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const tokenService = require('../services/token');
const certificateService = require('../services/certificate');
const { Certificate } = require('../models');
const { strictLimiter, standardLimiter } = require('../../shared');
const { requireSession, requireSessionOrService, requireAdminSession, userHasAdminRole } = require('../middleware/auth');
const {
  certificateSigningRequestSchema,
  renewCertificateSchema,
  generateRootCertificateSchema,
  generateIntermediateCertificateSchema,
  generateCertificateSchema,
  generateTokenSchema,
  validateTokenSchema,
  revokeTokenSchema,
  refreshTokenSchema,
  validate
} = require('../validators');

/**
 * Map a caught error to a JSON response.
 * Typed service errors (with .status) are surfaced with their code/message;
 * everything else becomes a generic 500 (details stay server-side).
 */
function sendRouteError(req, res, error, logMessage, fallbackMessage) {
  req.logger.error(logMessage, error);

  if (error && error.status && error.status < 500) {
    return res.status(error.status).json({
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message
      }
    });
  }

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: fallbackMessage
    }
  });
}

/**
 * Certificate access rule for non-admin users:
 * own certificates, or public CA chain material (root/intermediate).
 */
function canAccessCertificate(certificate, userId, isAdmin) {
  if (isAdmin) {
    return true;
  }
  if (certificate.type === 'root' || certificate.type === 'intermediate') {
    return true;
  }
  return certificate.userId === userId;
}

/**
 * POST /api/tokens/generate - Generate token (Section 8.3)
 */
router.post('/tokens/generate',
  requireSession,
  validate(generateTokenSchema),
  async (req, res) => {
  try {
    const isAdmin = await userHasAdminRole(req.session.user.id);
    const token = await tokenService.generateToken(req.body, req.session.user.id, { isAdmin });

    res.status(201).json({
      success: true,
      token
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Token generation failed:', 'Failed to generate token');
  }
});

/**
 * POST /api/tokens/validate - Validate token (Section 9.2)
 * Supports both token ID and full token object validation
 */
router.post('/tokens/validate',
  standardLimiter, // 100 req/15min for service-to-service validation
  requireSessionOrService,
  validate(validateTokenSchema),
  async (req, res) => {
  try {
    const { token, tokenId, requiredPermissions, resource, resourceValue } = req.body;

    // Support both token ID (for internal use) and full token object (for service-to-service)
    let tokenIdentifier = tokenId;

    if (!tokenIdentifier && token) {
      // If full token object provided, extract ID
      if (typeof token === 'string') {
        try {
          const parsed = JSON.parse(token);
          tokenIdentifier = parsed.id;
        } catch (e) {
          // Assume it's already a token ID string
          tokenIdentifier = token;
        }
      } else if (typeof token === 'object' && token.id) {
        tokenIdentifier = token.id;
      }
    }

    if (!tokenIdentifier) {
      return res.status(400).json({
        error: 'TOKEN_REQUIRED',
        message: 'Token or token ID is required'
      });
    }

    // Build validation parameters
    const validationParams = {};

    // Support both single permission and multiple permissions
    if (requiredPermissions) {
      // Convert array format to object format if needed
      if (Array.isArray(requiredPermissions)) {
        validationParams.requiredPermissions = requiredPermissions.reduce((acc, perm) => {
          acc[perm] = true;
          return acc;
        }, {});
      } else if (typeof requiredPermissions === 'object') {
        validationParams.requiredPermissions = requiredPermissions;
      }
    }

    // Support both 'resource' and 'resourceValue' parameters
    if (resource || resourceValue) {
      validationParams.resourceValue = resource || resourceValue;
    }

    const result = await tokenService.validateToken(tokenIdentifier, validationParams);

    if (result.valid) {
      res.status(200).json({
        success: true,
        valid: true,
        token: result.token,
        tokenData: result.token.data,
        userId: result.token.data?.userId,
        permissions: result.token.permissions
      });
    } else {
      res.status(401).json({
        success: false,
        valid: false,
        error: result.error,
        message: result.message,
        reason: result.message
      });
    }
  } catch (error) {
    req.logger.error('Token validation failed:', error);

    res.status(500).json({
      error: 'VALIDATION_ERROR',
      message: 'Failed to validate token'
    });
  }
});

/**
 * POST /api/tokens/revoke - Revoke token
 */
router.post('/tokens/revoke',
  requireSession,
  validate(revokeTokenSchema),
  async (req, res) => {
  try {
    const { tokenId, reason } = req.body;

    const isAdmin = await userHasAdminRole(req.session.user.id);
    const token = await tokenService.revokeToken(
      tokenId,
      reason || 'User requested revocation',
      req.session.user.id,
      { isAdmin }
    );

    res.status(200).json({
      success: true,
      message: 'Token revoked successfully',
      token: {
        id: token.id,
        status: token.status,
        revokedAt: token.revokedAt
      }
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Token revocation failed:', 'Failed to revoke token');
  }
});

/**
 * GET /api/tokens - List user tokens
 */
router.get('/tokens', requireSession, async (req, res) => {
  try {
    const tokens = await tokenService.listTokens(req.session.user.id, {
      status: req.query.status,
      limit: parseInt(req.query.limit) || 50
    });

    res.status(200).json({
      success: true,
      tokens: tokens.map(t => ({
        id: t.id,
        resourceType: t.resourceType,
        resourceValue: t.resourceValue,
        permissions: t.getPermissions(),
        expiryType: t.expiryType,
        expiresAt: t.expiresAt,
        usesRemaining: t.usesRemaining,
        status: t.status,
        createdAt: t.createdAt
      }))
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Failed to list tokens:', 'Failed to list tokens');
  }
});

/**
 * POST /api/certificates/generate-root - Generate root CA certificate
 * Note: For initial setup and admin use only
 */
router.post('/certificates/generate-root',
  requireAdminSession,
  validate(generateRootCertificateSchema),
  async (req, res) => {
  try {
    const certificate = await certificateService.createRootCertificate(
      req.body,
      req.session.user.id
    );

    res.status(201).json({
      success: true,
      certificate: {
        id: certificate.id,
        serialNumber: certificate.serialNumber,
        commonName: certificate.commonName,
        fingerprint: certificate.fingerprint,
        notBefore: certificate.notBefore,
        notAfter: certificate.notAfter,
        type: certificate.type,
        status: certificate.status,
        pem: certificate.certificatePem
      }
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Root certificate generation failed:', 'Failed to generate root certificate');
  }
});

/**
 * POST /api/certificates/generate-intermediate - Generate intermediate CA certificate
 * Note: For initial setup and admin use only
 */
router.post('/certificates/generate-intermediate',
  requireAdminSession,
  validate(generateIntermediateCertificateSchema),
  async (req, res) => {
  try {
    const certificate = await certificateService.createIntermediateCertificate(
      req.body,
      req.session.user.id
    );

    res.status(201).json({
      success: true,
      certificate: {
        id: certificate.id,
        serialNumber: certificate.serialNumber,
        commonName: certificate.commonName,
        fingerprint: certificate.fingerprint,
        notBefore: certificate.notBefore,
        notAfter: certificate.notAfter,
        type: certificate.type,
        status: certificate.status,
        issuerId: certificate.issuerId,
        pem: certificate.certificatePem
      }
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Intermediate certificate generation failed:', 'Failed to generate intermediate certificate');
  }
});

/**
 * POST /api/certificates/generate-code-signing - Generate code signing certificate
 * Note: For initial setup and admin use only
 */
router.post('/certificates/generate-code-signing',
  requireAdminSession,
  validate(generateCertificateSchema),
  async (req, res) => {
  try {
    // Set type to code_signing
    const options = {
      ...req.body,
      type: 'code_signing'
    };

    const result = await certificateService.createEntityCertificate(
      options,
      req.session.user.id
    );

    res.status(201).json({
      success: true,
      certificate: {
        id: result.certificate.id,
        serialNumber: result.certificate.serialNumber,
        commonName: result.certificate.commonName,
        fingerprint: result.certificate.fingerprint,
        notBefore: result.certificate.notBefore,
        notAfter: result.certificate.notAfter,
        type: result.certificate.type,
        status: result.certificate.status,
        issuerId: result.certificate.issuerId,
        pem: result.certificate.certificatePem
      },
      privateKey: result.privateKey
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Code signing certificate generation failed:', 'Failed to generate code signing certificate');
  }
});

/**
 * POST /api/certificates/generate - Generate certificate
 */
router.post('/certificates/generate',
  requireSession,
  validate(generateCertificateSchema),
  async (req, res) => {
  try {
    const result = await certificateService.createEntityCertificate(
      req.body,
      req.session.user.id
    );

    res.status(201).json({
      success: true,
      certificate: {
        id: result.certificate.id,
        serialNumber: result.certificate.serialNumber,
        commonName: result.certificate.commonName,
        fingerprint: result.certificate.fingerprint,
        notBefore: result.certificate.notBefore,
        notAfter: result.certificate.notAfter,
        pem: result.certificate.certificatePem
      },
      privateKey: result.privateKey
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Certificate generation failed:', 'Failed to generate certificate');
  }
});

/**
 * GET /api/certificates/:id - Get certificate
 */
router.get('/certificates/:id', requireSession, async (req, res) => {
  try {
    const certificate = await certificateService.getCertificate(req.params.id);

    if (!certificate) {
      return res.status(404).json({
        error: 'CERTIFICATE_NOT_FOUND',
        message: 'Certificate not found'
      });
    }

    const isAdmin = await userHasAdminRole(req.session.user.id);
    if (!canAccessCertificate(certificate, req.session.user.id, isAdmin)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this certificate'
        }
      });
    }

    res.status(200).json({
      success: true,
      certificate: {
        id: certificate.id,
        serialNumber: certificate.serialNumber,
        commonName: certificate.commonName,
        type: certificate.type,
        status: certificate.status,
        notBefore: certificate.notBefore,
        notAfter: certificate.notAfter,
        fingerprint: certificate.fingerprint
      }
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Failed to get certificate:', 'Failed to get certificate');
  }
});

/**
 * POST /api/certificates/csr - Process Certificate Signing Request
 */
router.post('/certificates/csr',
  requireAdminSession,
  validate(certificateSigningRequestSchema),
  async (req, res) => {
    try {
      const { csr, validityDays, type } = req.body;

      const certificate = await certificateService.processCsr(
        csr,
        {
          issuerId: req.body.issuerId,
          validityDays,
          type
        },
        req.session.user.id
      );

      res.status(201).json({
        success: true,
        certificate: {
          id: certificate.id,
          serialNumber: certificate.serialNumber,
          commonName: certificate.commonName,
          fingerprint: certificate.fingerprint,
          notBefore: certificate.notBefore,
          notAfter: certificate.notAfter,
          type: certificate.type,
          status: certificate.status,
          pem: certificate.certificatePem
        }
      });
    } catch (error) {
      sendRouteError(req, res, error, 'CSR processing failed:', 'Failed to process CSR');
    }
  }
);

/**
 * POST /api/certificates/:id/renew - Renew certificate
 */
router.post('/certificates/:id/renew',
  requireAdminSession,
  validate(renewCertificateSchema),
  async (req, res) => {
    try {
      const { validityDays, keySize } = req.body;

      const result = await certificateService.renewCertificate(
        req.params.id,
        { validityDays, keySize },
        req.session.user.id
      );

      res.status(201).json({
        success: true,
        certificate: {
          id: result.certificate.id,
          serialNumber: result.certificate.serialNumber,
          commonName: result.certificate.commonName,
          fingerprint: result.certificate.fingerprint,
          notBefore: result.certificate.notBefore,
          notAfter: result.certificate.notAfter,
          type: result.certificate.type,
          status: result.certificate.status,
          pem: result.certificate.certificatePem
        },
        privateKey: result.privateKey
      });
    } catch (error) {
      sendRouteError(req, res, error, 'Certificate renewal failed:', 'Failed to renew certificate');
    }
  }
);

/**
 * GET /api/certificates/:id/chain - Get certificate chain
 */
router.get('/certificates/:id/chain', requireSession, async (req, res) => {
  try {
    const certificate = await certificateService.getCertificate(req.params.id);

    if (!certificate) {
      return res.status(404).json({
        error: 'CERTIFICATE_NOT_FOUND',
        message: 'Certificate not found'
      });
    }

    const isAdmin = await userHasAdminRole(req.session.user.id);
    if (!canAccessCertificate(certificate, req.session.user.id, isAdmin)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this certificate'
        }
      });
    }

    const chain = await certificateService.getCertificateChain(req.params.id);

    res.status(200).json({
      success: true,
      chain,
      chainLength: chain.length
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Failed to get certificate chain:', 'Failed to get certificate chain');
  }
});

/**
 * GET /api/certificates/:id/download - Download certificate with chain
 */
router.get('/certificates/:id/download', requireSession, async (req, res) => {
  try {
    const format = req.query.format || 'pem';

    if (!['pem', 'der'].includes(format)) {
      return res.status(400).json({
        error: 'INVALID_FORMAT',
        message: 'Format must be pem or der'
      });
    }

    const certificate = await certificateService.getCertificate(req.params.id);

    if (!certificate) {
      return res.status(404).json({
        error: 'CERTIFICATE_NOT_FOUND',
        message: 'Certificate not found'
      });
    }

    const isAdmin = await userHasAdminRole(req.session.user.id);
    if (!canAccessCertificate(certificate, req.session.user.id, isAdmin)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this certificate'
        }
      });
    }

    const chain = await certificateService.getCertificateChain(req.params.id);

    if (chain.length === 0) {
      return res.status(404).json({
        error: 'CERTIFICATE_NOT_FOUND',
        message: 'Certificate not found'
      });
    }

    if (format === 'pem') {
      // Concatenate all certificates in PEM format
      const pemChain = chain.map(cert => cert.pem).join('\n');

      res.setHeader('Content-Type', 'application/x-pem-file');
      res.setHeader('Content-Disposition', `attachment; filename="certificate-chain.pem"`);
      res.send(pemChain);
    } else {
      // DER format - only return entity certificate (not full chain)
      const cert = chain[0];
      const derBuffer = Buffer.from(
        cert.pem
          .replace(/-----BEGIN CERTIFICATE-----/, '')
          .replace(/-----END CERTIFICATE-----/, '')
          .replace(/\s/g, ''),
        'base64'
      );

      res.setHeader('Content-Type', 'application/x-x509-ca-cert');
      res.setHeader('Content-Disposition', `attachment; filename="certificate.der"`);
      res.send(derBuffer);
    }
  } catch (error) {
    sendRouteError(req, res, error, 'Failed to download certificate:', 'Failed to download certificate');
  }
});

/**
 * POST /api/tokens/:id/refresh - Refresh token expiration
 */
router.post('/tokens/:id/refresh',
  requireSession,
  validate(refreshTokenSchema),
  async (req, res) => {
    try {
      const { expiresAt } = req.body;

      const isAdmin = await userHasAdminRole(req.session.user.id);
      const token = await tokenService.refreshToken(
        req.params.id,
        expiresAt,
        req.session.user.id,
        { isAdmin }
      );

      res.status(200).json({
        success: true,
        token: {
          id: token.id,
          expiresAt: token.expiresAt,
          status: token.status
        },
        message: 'Token expiration refreshed successfully'
      });
    } catch (error) {
      sendRouteError(req, res, error, 'Token refresh failed:', 'Failed to refresh token');
    }
  }
);

/**
 * GET /api/tokens/:id/introspect - Get token metadata
 */
router.get('/tokens/:id/introspect', requireSession, async (req, res) => {
  try {
    const isAdmin = await userHasAdminRole(req.session.user.id);
    const introspection = await tokenService.introspectToken(req.params.id, {
      userId: req.session.user.id,
      isAdmin
    });

    res.status(200).json({
      success: true,
      introspection
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Token introspection failed:', 'Failed to introspect token');
  }
});

/**
 * POST /api/auth/verify-password - Verify user password
 * Used by Auth service for MFA password confirmation
 */
router.post('/auth/verify-password',
  strictLimiter, // 10 req/15min to prevent brute force
  requireSession, // No service-auth pattern in this module; require an authenticated session
  async (req, res) => {
  try {
    const { userId, password } = req.body;

    if (!userId || !password) {
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'userId and password are required'
      });
    }

    // Uniform failure response: never reveal whether the user exists
    const invalidCredentials = () => res.status(401).json({
      success: false,
      valid: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials'
      }
    });

    // Get user from database
    const { User } = require('../models');
    const user = await User.findByPk(userId);

    if (!user) {
      return invalidCredentials();
    }

    // Check if account is locked
    if (user.isLocked && user.isLocked()) {
      return res.status(403).json({
        error: 'ACCOUNT_LOCKED',
        message: 'Account is locked'
      });
    }

    // Verify password
    const isValid = await user.validatePassword(password);

    if (!isValid) {
      // Increment failed attempts for security monitoring
      if (user.incrementFailedAttempts) {
        await user.incrementFailedAttempts();
      }

      return invalidCredentials();
    }

    // Reset failed attempts on successful verification
    if (user.resetFailedAttempts) {
      await user.resetFailedAttempts();
    }

    res.status(200).json({
      success: true,
      valid: true,
      message: 'Password verified successfully'
    });

  } catch (error) {
    sendRouteError(req, res, error, 'Password verification failed:', 'Failed to verify password');
  }
});

module.exports = router;
