/**
 * ═══════════════════════════════════════════════════════════════════════
 * API Routes - Token Generation and Validation (Spec v1.0)
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const forge = require('node-forge');
const router = express.Router();
const tokenService = require('../services/token');
const certificateService = require('../services/certificate');
const ocspService = require('../services/ocsp');
const crlService = require('../services/crl');
const cryptoUtil = require('../crypto');
const config = require('../config');
const { Certificate, RevocationList } = require('../models');
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
  bulkRevokeTokenSchema,
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
 * Valid X.509 revocation reasons (mirrors the Certificate.revocationReason ENUM).
 */
const REVOCATION_REASONS = [
  'unspecified',
  'keyCompromise',
  'caCompromise',
  'affiliationChanged',
  'superseded',
  'cessationOfOperation',
  'certificateHold',
  'removeFromCRL',
  'privilegeWithdrawn',
  'aaCompromise'
];

/**
 * Owner-or-admin gate for a certificate: the caller owns it, or is an admin.
 * Unlike canAccessCertificate, this does NOT grant access to CA chain material
 * (root/intermediate) — only the owning user (or an admin) may revoke/export.
 */
function ownsOrAdmin(certificate, userId, isAdmin) {
  return isAdmin || certificate.userId === userId;
}

/**
 * Serialize a certificate for list/JSON payloads, excluding private key material.
 */
function publicCertificateView(certificate) {
  return {
    id: certificate.id,
    serialNumber: certificate.serialNumber,
    commonName: certificate.commonName,
    type: certificate.type,
    status: certificate.status,
    issuerId: certificate.issuerId,
    organization: certificate.organization,
    notBefore: certificate.notBefore,
    notAfter: certificate.notAfter,
    fingerprint: certificate.fingerprint,
    revokedAt: certificate.revokedAt,
    revocationReason: certificate.revocationReason,
    createdAt: certificate.createdAt
  };
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
    // The request schema nests resource as { type, value }; the token service
    // expects flat resourceType/resourceValue (as other callers pass it).
    const params = { ...req.body };
    if (params.resource && typeof params.resource === 'object') {
      params.resourceType = params.resource.type;
      params.resourceValue = params.resource.value;
      delete params.resource;
    }
    const token = await tokenService.generateToken(params, req.session.user.id, { isAdmin });

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
        revokedAt: token.revokedAt,
        revokedReason: token.revokedReason,
        revokedBy: token.revokedBy
      }
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Token revocation failed:', 'Failed to revoke token');
  }
});

/**
 * POST /api/tokens/revoke-bulk - Invalidate every active token in a scope
 * (spec v1.1 §10.2). Scopes: user (self or admin), group / organization
 * (admin/owner of that group/org, or a system admin).
 */
router.post('/tokens/revoke-bulk',
  requireSession,
  validate(bulkRevokeTokenSchema),
  async (req, res) => {
  try {
    const { scope, targetId, reason } = req.body;

    const isAdmin = await userHasAdminRole(req.session.user.id);
    const scopeFilter =
      scope === 'user' ? { userId: targetId } :
      scope === 'group' ? { groupId: targetId } :
      { organizationId: targetId };

    const revokedCount = await tokenService.revokeTokensByScope(
      scopeFilter,
      reason || `Bulk revocation (${scope})`,
      req.session.user.id,
      { isAdmin }
    );

    res.status(200).json({
      success: true,
      revokedCount
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Bulk token revocation failed:', 'Failed to revoke tokens');
  }
});

/**
 * GET /api/users/me/groups - The caller's CA directory group memberships
 * (with their membership role). Used by the SPA to offer group/organization
 * scoping when generating tokens and to expose group-admin token actions.
 */
router.get('/users/me/groups', requireSession, async (req, res) => {
  try {
    const { UserGroup, Group } = require('../models');
    const memberships = await UserGroup.findAll({
      where: { userId: req.session.user.id }
    });

    const groupIds = memberships.map(m => m.groupId);
    const groups = groupIds.length
      ? await Group.findAll({ where: { id: groupIds, status: 'active' } })
      : [];

    res.status(200).json({
      success: true,
      groups: groups.map(g => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
        type: g.type,
        role: memberships.find(m => m.groupId === g.id)?.role || 'member'
      }))
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Failed to list user groups:', 'Failed to list groups');
  }
});

/**
 * Serialize a token for list payloads (spec v1.1 fields included).
 */
function tokenListView(t) {
  return {
    id: t.id,
    version: t.version,
    resourceType: t.resourceType,
    resourceValue: t.resourceValue,
    permissions: t.getPermissions(),
    expiryType: t.expiryType,
    notBefore: t.notBefore,
    expiresAt: t.expiresAt,
    usesRemaining: t.usesRemaining,
    maxUses: t.maxUses,
    useCount: t.useCount,
    lastUsedAt: t.lastUsedAt,
    status: t.status,
    revokedAt: t.revokedAt,
    revokedReason: t.revokedReason,
    revokedBy: t.revokedBy,
    groupId: t.groupId,
    group: t.group ? { id: t.group.id, name: t.group.name, type: t.group.type } : null,
    organizationId: t.organizationId,
    organization: t.organization
      ? { id: t.organization.id, name: t.organization.name, type: t.organization.type }
      : null,
    certificate: t.certificate
      ? {
          id: t.certificate.id,
          commonName: t.certificate.commonName,
          serialNumber: t.certificate.serialNumber,
          status: t.certificate.status
        }
      : null,
    createdAt: t.createdAt
  };
}

/**
 * GET /api/tokens - List user tokens.
 * With ?groupId= / ?organizationId=, lists that scope's tokens instead —
 * allowed for admins of the group/org (or system admins).
 */
router.get('/tokens', requireSession, async (req, res) => {
  try {
    const callerId = req.session.user.id;
    const { groupId, organizationId } = req.query;

    let ownerId = callerId;
    const filters = {
      status: req.query.status,
      limit: parseInt(req.query.limit) || 50
    };

    if (groupId || organizationId) {
      const scopeGroupId = groupId || organizationId;
      const isAdmin = await userHasAdminRole(callerId);
      if (!isAdmin && !(await tokenService.isGroupAdmin(callerId, scopeGroupId))) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'SCOPE_NOT_AUTHORIZED',
            message: 'Only a group/organization admin may list its tokens'
          }
        });
      }
      ownerId = null; // scope-wide listing
      if (groupId) filters.groupId = groupId;
      if (organizationId) filters.organizationId = organizationId;
    }

    const tokens = await tokenService.listTokens(ownerId, filters);

    res.status(200).json({
      success: true,
      tokens: tokens.map(tokenListView)
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Failed to list tokens:', 'Failed to list tokens');
  }
});

/**
 * GET /api/certificates - List the caller's own certificates.
 * Admins still use the admin list (/ca/admin/api/certificates) for all certs.
 * Private key material is never included.
 */
router.get('/certificates', requireSession, async (req, res) => {
  try {
    const where = { userId: req.session.user.id };
    if (req.query.type) where.type = req.query.type;
    if (req.query.status) where.status = req.query.status;

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    const { rows, count } = await Certificate.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      attributes: { exclude: ['privateKeyEncrypted', 'certificateDer'] }
    });

    res.status(200).json({
      success: true,
      certificates: rows.map(publicCertificateView),
      count
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Failed to list certificates:', 'Failed to list certificates');
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
  requireSession,
  validate(renewCertificateSchema),
  async (req, res) => {
    try {
      const { validityDays, keySize } = req.body;

      // Owner-or-admin gate (was admin-only). Renewal reissues the same subject
      // from the same issuer, so allowing the owner to self-renew is safe.
      const existing = await certificateService.getCertificate(req.params.id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: { code: 'CERTIFICATE_NOT_FOUND', message: 'Certificate not found' }
        });
      }

      const isAdmin = await userHasAdminRole(req.session.user.id);
      if (!ownsOrAdmin(existing, req.session.user.id, isAdmin)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have access to this certificate' }
        });
      }

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
 * POST /api/certificates/:id/revoke - Revoke a certificate (owner-or-admin).
 * Triggers the cert→token revocation cascade in the service layer.
 */
router.post('/certificates/:id/revoke', requireSession, async (req, res) => {
  try {
    const reason = (req.body && req.body.reason) || 'unspecified';
    if (!REVOCATION_REASONS.includes(reason)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REASON', message: 'Invalid revocation reason' }
      });
    }

    const certificate = await certificateService.getCertificate(req.params.id);
    if (!certificate) {
      return res.status(404).json({
        success: false,
        error: { code: 'CERTIFICATE_NOT_FOUND', message: 'Certificate not found' }
      });
    }

    const isAdmin = await userHasAdminRole(req.session.user.id);
    if (!ownsOrAdmin(certificate, req.session.user.id, isAdmin)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have access to this certificate' }
      });
    }

    if (certificate.status === 'revoked') {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_REVOKED', message: 'Certificate already revoked' }
      });
    }

    const revoked = await certificateService.revokeCertificate(
      req.params.id,
      reason,
      req.session.user.id
    );

    res.status(200).json({
      success: true,
      certificate: {
        id: revoked.id,
        serialNumber: revoked.serialNumber,
        commonName: revoked.commonName,
        status: revoked.status,
        revokedAt: revoked.revokedAt,
        revocationReason: revoked.revocationReason
      },
      revokedTokenCount: revoked.revokedTokenCount || 0
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Certificate revocation failed:', 'Failed to revoke certificate');
  }
});

/**
 * GET /api/certificates/:id/export - Advanced export (owner-or-admin).
 * format ∈ pem | der | chain | pkcs12.
 *   - pem    : leaf certificate PEM
 *   - chain  : full chain PEM (leaf → root)
 *   - der    : leaf certificate DER
 *   - pkcs12 : password-protected .p12 bundling leaf + chain + private key
 *              (requires `password` and a stored encrypted private key)
 * A raw, unencrypted private key is NEVER exported.
 */
router.get('/certificates/:id/export', requireSession, async (req, res) => {
  try {
    const format = (req.query.format || 'pem').toLowerCase();
    if (!['pem', 'der', 'chain', 'pkcs12'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FORMAT', message: 'Format must be pem, der, chain, or pkcs12' }
      });
    }

    const certificate = await certificateService.getCertificate(req.params.id);
    if (!certificate) {
      return res.status(404).json({
        success: false,
        error: { code: 'CERTIFICATE_NOT_FOUND', message: 'Certificate not found' }
      });
    }

    const isAdmin = await userHasAdminRole(req.session.user.id);
    if (!ownsOrAdmin(certificate, req.session.user.id, isAdmin)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have access to this certificate' }
      });
    }

    const chain = await certificateService.getCertificateChain(req.params.id);
    if (chain.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'CERTIFICATE_NOT_FOUND', message: 'Certificate not found' }
      });
    }

    const safeName = (certificate.commonName || 'certificate').replace(/[^a-zA-Z0-9._-]/g, '_');

    if (format === 'pem') {
      res.setHeader('Content-Type', 'application/x-pem-file');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pem"`);
      return res.send(chain[0].pem);
    }

    if (format === 'chain') {
      res.setHeader('Content-Type', 'application/x-pem-file');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}-chain.pem"`);
      return res.send(chain.map(c => c.pem).join('\n'));
    }

    if (format === 'der') {
      const derBuffer = Buffer.from(
        chain[0].pem
          .replace(/-----BEGIN CERTIFICATE-----/, '')
          .replace(/-----END CERTIFICATE-----/, '')
          .replace(/\s/g, ''),
        'base64'
      );
      res.setHeader('Content-Type', 'application/x-x509-ca-cert');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.der"`);
      return res.send(derBuffer);
    }

    // format === 'pkcs12'
    const password = req.query.password || req.headers['x-export-password'];
    if (!password) {
      return res.status(400).json({
        success: false,
        error: { code: 'PASSWORD_REQUIRED', message: 'A password is required for PKCS#12 export' }
      });
    }

    if (!certificate.privateKeyEncrypted) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_PRIVATE_KEY',
          message: 'This certificate has no stored private key available for PKCS#12 export'
        }
      });
    }

    let privateKey;
    try {
      // Use the module's own private-key decryption, then parse to a forge key.
      const privateKeyPem = cryptoUtil.decryptPrivateKey(certificate.privateKeyEncrypted, password);
      privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
    } catch (decryptError) {
      req.logger.warn('PKCS#12 export: private key decryption failed', { error: decryptError.message });
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Could not decrypt the private key with the provided password' }
      });
    }

    if (!privateKey) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Could not decrypt the private key with the provided password' }
      });
    }

    const certChain = chain.map(c => forge.pki.certificateFromPem(c.pem));
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, certChain, password, {
      algorithm: '3des',
      friendlyName: certificate.commonName
    });
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    const p12Buffer = Buffer.from(p12Der, 'binary');

    res.setHeader('Content-Type', 'application/x-pkcs12');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.p12"`);
    return res.send(p12Buffer);
  } catch (error) {
    sendRouteError(req, res, error, 'Certificate export failed:', 'Failed to export certificate');
  }
});

/**
 * GET /api/certificates/:id/status - Live revocation status (owner-or-admin).
 * The endpoint the SPA polls for CRL/OCSP state.
 */
router.get('/certificates/:id/status', requireSession, async (req, res) => {
  try {
    const certificate = await certificateService.getCertificate(req.params.id);
    if (!certificate) {
      return res.status(404).json({
        success: false,
        error: { code: 'CERTIFICATE_NOT_FOUND', message: 'Certificate not found' }
      });
    }

    const isAdmin = await userHasAdminRole(req.session.user.id);
    if (!ownsOrAdmin(certificate, req.session.user.id, isAdmin)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have access to this certificate' }
      });
    }

    const ocsp = { enabled: !!config.ocsp.enabled, status: null };
    if (config.ocsp.enabled) {
      try {
        const result = await ocspService.checkStatus(certificate.serialNumber);
        ocsp.status = result.status;
      } catch (ocspError) {
        req.logger.warn('OCSP status check failed', { error: ocspError.message });
      }
    }

    const crl = {
      enabled: !!config.crl.enabled,
      crlNumber: null,
      thisUpdate: null,
      nextUpdate: null,
      listed: null
    };
    if (config.crl.enabled) {
      const info = crlService.getCRLInfo();
      if (info) {
        crl.crlNumber = info.crlNumber;
        crl.thisUpdate = info.thisUpdate;
        crl.nextUpdate = info.nextUpdate;
      }
      const listing = await RevocationList.findOne({
        where: { serialNumber: certificate.serialNumber }
      });
      crl.listed = !!listing;
    }

    res.status(200).json({
      success: true,
      serialNumber: certificate.serialNumber,
      status: certificate.status,
      revoked: certificate.status === 'revoked',
      revocationReason: certificate.revocationReason || null,
      revokedAt: certificate.revokedAt || null,
      ocsp,
      crl
    });
  } catch (error) {
    sendRouteError(req, res, error, 'Failed to get certificate status:', 'Failed to get certificate status');
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
