/**
 * Exprsn Vault - Credentials Routes (Service Credentials Management)
 *
 * Backed by the dynamic secrets engine (leases). Credential material is
 * encrypted at rest and never echoed back except at generation time.
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { asyncHandler, AppError, createRateLimiter } = require('@exprsn/shared');
const { requireToken, requireWrite, requireDelete, requireRead } = require('../middleware/auth');
const dynamicService = require('../services/dynamicService');

// Rate limiters
const strictLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyPrefix: 'vault:creds:strict'
});

const readLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  keyPrefix: 'vault:creds:read'
});

// Validation schemas
const storeCredentialSchema = Joi.object({
  username: Joi.string().min(1).max(255).required(),
  password: Joi.string().min(1).required(),
  metadata: Joi.object().default({}),
  ttl: Joi.number().integer().min(60).max(31536000).default(31536000), // 1 year
  renewable: Joi.boolean().default(true)
});

const generateDatabaseSchema = Joi.object({
  database: Joi.string().min(1).max(255).required(),
  role: Joi.string().min(1).max(255).optional(),
  ttl: Joi.alternatives().try(
    Joi.number().integer().min(60).max(86400),
    Joi.string().pattern(/^\d+[smh]$/)
  ).default(3600),
  databaseType: Joi.string().valid('postgresql', 'mysql', 'mongodb').default('postgresql'),
  connection: Joi.object().optional()
});

/**
 * Parse a TTL value ('1h', '30m', '90s' or seconds) into seconds
 * @param {string|number} ttl - TTL specifier
 * @returns {number} TTL in seconds
 */
function parseTtlSeconds(ttl) {
  if (typeof ttl === 'number') return ttl;
  const match = String(ttl).match(/^(\d+)([smh])$/);
  if (!match) return 3600;
  const value = parseInt(match[1], 10);
  const unit = { s: 1, m: 60, h: 3600 }[match[2]];
  return value * unit;
}

/**
 * Resolve the authenticated actor for audit attribution
 * @param {Object} req - Express request (after requireToken middleware)
 * @returns {string} Actor identifier
 */
function getActor(req) {
  return req.user?.username || req.user?.id || req.userId || 'service';
}

/**
 * Build the lease path for a service credential
 */
function credentialPath(service, name) {
  return `/credentials/${service}/${name}`;
}

// List service credentials (lease metadata only — values never exposed)
router.get('/',
  readLimiter,
  ...requireRead('/credentials'),
  asyncHandler(async (req, res) => {
    const { service, status, limit, offset } = req.query;

    const leases = await dynamicService.listLeases({
      status,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    // Entity scoping: only leases under the credentials namespace, and
    // optionally scoped to one service.
    const prefix = service ? credentialPath(service, '') : '/credentials/';
    const credentials = leases.filter(lease =>
      typeof lease.secretPath === 'string' && lease.secretPath.startsWith(prefix)
    );

    res.json({
      success: true,
      data: credentials,
      count: credentials.length,
      message: 'Credentials listed (values not exposed)'
    });
  })
);

// Get credential metadata (values are write-only; retrieval not supported)
router.get('/:service/:name',
  readLimiter,
  ...requireRead('/credentials'),
  asyncHandler(async (req, res) => {
    const { service, name } = req.params;
    const path = credentialPath(service, name);

    const leases = await dynamicService.listLeases({ status: 'active' });
    const lease = leases.find(l => l.secretPath === path);

    if (!lease) {
      throw new AppError(`Credential not found: ${service}/${name}`, 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: {
        service,
        name,
        leaseId: lease.leaseId,
        metadata: {
          createdAt: lease.createdAt,
          expiresAt: lease.expiresAt,
          renewable: lease.renewable,
          status: lease.status
        }
      }
    });
  })
);

// Store credential (encrypted lease in the dynamic secrets engine)
router.post('/:service/:name',
  strictLimiter,
  ...requireWrite('/credentials'),
  asyncHandler(async (req, res) => {
    const { service, name } = req.params;
    const actor = getActor(req);

    const { error, value } = storeCredentialSchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const path = credentialPath(service, name);

    // Reject duplicates so credentials are not silently shadowed
    const existing = (await dynamicService.listLeases({ status: 'active' }))
      .find(l => l.secretPath === path);
    if (existing) {
      throw new AppError(`Credential already exists: ${service}/${name}`, 409, 'CONFLICT');
    }

    const lease = await dynamicService.createLease({
      secretType: 'credential',
      secretPath: path,
      credentialData: {
        type: 'credential',
        username: value.username,
        password: value.password,
        metadata: value.metadata
      },
      ttl: value.ttl,
      maxTTL: value.ttl,
      renewable: value.renewable,
      actor
    });

    res.status(201).json({
      success: true,
      data: {
        service,
        name,
        leaseId: lease.leaseId,
        expiresAt: lease.expiresAt
      },
      message: 'Credential stored successfully'
    });
  })
);

// Update credential — not supported by the dynamic secrets engine
// (leases are immutable; revoke and re-create instead)
router.put('/:service/:name',
  strictLimiter,
  ...requireWrite('/credentials'),
  asyncHandler(async (req, res) => {
    res.status(501).json({
      success: false,
      error: 'NOT_IMPLEMENTED',
      message: 'Credential update is not supported. Revoke the credential and store a new one.'
    });
  })
);

// Delete (revoke) credential
router.delete('/:service/:name',
  strictLimiter,
  ...requireDelete('/credentials'),
  asyncHandler(async (req, res) => {
    const { service, name } = req.params;
    const actor = getActor(req);
    const path = credentialPath(service, name);

    const leases = await dynamicService.listLeases({ status: 'active' });
    const matching = leases.filter(l => l.secretPath === path);

    if (matching.length === 0) {
      throw new AppError(`Credential not found: ${service}/${name}`, 404, 'NOT_FOUND');
    }

    for (const lease of matching) {
      await dynamicService.revokeLease(lease.leaseId, actor);
    }

    res.json({
      success: true,
      message: 'Credential revoked successfully'
    });
  })
);

// Generate database credentials (dynamic secrets)
router.post('/database/generate',
  strictLimiter,
  ...requireWrite('/credentials'),
  asyncHandler(async (req, res) => {
    const actor = getActor(req);

    const { error, value } = generateDatabaseSchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const ttlSeconds = parseTtlSeconds(value.ttl);

    const lease = await dynamicService.generateDatabaseCredentials(
      {
        path: credentialPath('database', value.database),
        ttl: ttlSeconds,
        databaseType: value.databaseType,
        connection: value.connection
      },
      actor
    );

    res.status(201).json({
      success: true,
      data: {
        username: lease.data.username,
        password: lease.data.password,
        database: value.database,
        role: value.role,
        leaseId: lease.leaseId,
        expiresAt: lease.expiresAt
      },
      message: 'Dynamic credentials generated successfully'
    });
  })
);

module.exports = router;
