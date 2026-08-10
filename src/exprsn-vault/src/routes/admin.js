/**
 * Exprsn Vault - Admin Routes
 * Comprehensive token and secret administration
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { asyncHandler, AppError, createRateLimiter } = require('@exprsn/shared');
const { requireWrite, requireDelete, requireRead } = require('../middleware/auth');
const tokenService = require('../services/tokenService');
const aiPolicyService = require('../services/aiPolicyService');
const redisCache = require('../services/redisCache');
const { VaultToken, AccessPolicy, TokenBinding, Secret, EncryptionKey } = require('../models');

// Rate limiters
const adminLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyPrefix: 'vault:admin'
});

// Validation schemas
const generateTokenSchema = Joi.object({
  displayName: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).optional(),
  entityType: Joi.string().valid('user', 'group', 'organization', 'service', 'certificate').required(),
  entityId: Joi.string().required(),
  permissions: Joi.object().required(),
  pathPrefixes: Joi.array().items(Joi.string()).optional(),
  ipWhitelist: Joi.array().items(Joi.string()).optional(),
  expiresAt: Joi.date().optional(),
  maxUses: Joi.number().integer().min(1).optional(),
  policyIds: Joi.array().items(Joi.string().uuid()).optional(),
  caIntegration: Joi.boolean().optional(),
  metadata: Joi.object().optional()
});

const createPolicySchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).optional(),
  policyType: Joi.string().valid('secret', 'key', 'credential', 'global').required(),
  rules: Joi.object().required(),
  entityTypes: Joi.array().items(Joi.string()).optional(),
  priority: Joi.number().integer().min(1).max(1000).optional(),
  enforcementMode: Joi.string().valid('enforcing', 'permissive', 'audit').optional()
});

// ================================================================================
// TOKEN MANAGEMENT
// ================================================================================

// Generate new Vault token
router.post('/tokens/generate',
  adminLimiter,
  ...requireWrite('/admin'),
  asyncHandler(async (req, res) => {
    const actor = req.user?.username || req.user?.id || 'admin';

    const { error, value } = generateTokenSchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const tokenData = await tokenService.generateToken(value, actor);

    res.status(201).json({
      success: true,
      data: tokenData,
      message: 'Vault token generated successfully. Store the token securely - it will not be shown again.'
    });
  })
);

// List all tokens
router.get('/tokens',
  adminLimiter,
  ...requireRead('/admin'),
  asyncHandler(async (req, res) => {
    const { entityType, entityId, status, limit, offset } = req.query;
    const actor = req.user?.username || req.user?.id || 'admin';

    const tokens = await tokenService.listTokens({
      entityType,
      entityId,
      status,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    }, actor);

    res.json({
      success: true,
      data: tokens,
      count: tokens.length
    });
  })
);

// Get token details
router.get('/tokens/:tokenId',
  adminLimiter,
  ...requireRead('/admin'),
  asyncHandler(async (req, res) => {
    const { tokenId } = req.params;

    const token = await VaultToken.findOne({
      where: { tokenId },
      include: [{
        model: TokenBinding,
        as: 'bindings',
        include: [{ model: AccessPolicy, as: 'policy' }]
      }],
      attributes: { exclude: ['tokenHash'] }
    });

    if (!token) {
      throw new AppError('Token not found', 404, 'NOT_FOUND');
    }

    // Get AI anomaly detection
    const anomalies = await aiPolicyService.detectAnomalies(tokenId);

    res.json({
      success: true,
      data: {
        ...token.toJSON(),
        anomalies: anomalies.anomalies,
        recommendation: anomalies.recommendation
      }
    });
  })
);

// Revoke token
router.post('/tokens/:tokenId/revoke',
  adminLimiter,
  ...requireWrite('/admin'),
  asyncHandler(async (req, res) => {
    const { tokenId } = req.params;
    const { reason } = req.body;
    const actor = req.user?.username || req.user?.id || 'admin';

    if (!reason) {
      throw new AppError('Revocation reason is required', 400, 'VALIDATION_ERROR');
    }

    const result = await tokenService.revokeToken(tokenId, reason, actor);

    res.json({
      success: true,
      data: result,
      message: 'Token revoked successfully'
    });
  })
);

// Suspend token
router.post('/tokens/:tokenId/suspend',
  adminLimiter,
  ...requireWrite('/admin'),
  asyncHandler(async (req, res) => {
    const { tokenId } = req.params;
    const { reason } = req.body;

    const token = await VaultToken.findOne({ where: { tokenId } });
    if (!token) {
      throw new AppError('Token not found', 404, 'NOT_FOUND');
    }

    await token.update({
      status: 'suspended',
      metadata: { ...token.metadata, suspendedReason: reason }
    });

    await redisCache.removeToken(tokenId);

    res.json({
      success: true,
      message: 'Token suspended successfully'
    });
  })
);

// Reactivate token
router.post('/tokens/:tokenId/reactivate',
  adminLimiter,
  ...requireWrite('/admin'),
  asyncHandler(async (req, res) => {
    const { tokenId } = req.params;

    const token = await VaultToken.findOne({ where: { tokenId } });
    if (!token) {
      throw new AppError('Token not found', 404, 'NOT_FOUND');
    }

    if (token.status === 'revoked') {
      throw new AppError('Cannot reactivate revoked token', 400, 'INVALID_OPERATION');
    }

    await token.update({ status: 'active' });

    res.json({
      success: true,
      message: 'Token reactivated successfully'
    });
  })
);

// Bulk revoke tokens
router.post('/tokens/bulk/revoke',
  adminLimiter,
  ...requireWrite('/admin'),
  asyncHandler(async (req, res) => {
    const { tokenIds, reason, entityType, entityId } = req.body;
    const actor = req.user?.username || req.user?.id || 'admin';

    let tokens = [];

    if (tokenIds && tokenIds.length > 0) {
      tokens = await VaultToken.findAll({ where: { tokenId: tokenIds } });
    } else if (entityType && entityId) {
      tokens = await VaultToken.findAll({ where: { entityType, entityId, status: 'active' } });
    } else {
      throw new AppError('Must provide tokenIds or entityType/entityId', 400, 'VALIDATION_ERROR');
    }

    const revoked = [];
    for (const token of tokens) {
      try {
        await tokenService.revokeToken(token.tokenId, reason, actor);
        revoked.push(token.tokenId);
      } catch (error) {
        // Continue with others
      }
    }

    res.json({
      success: true,
      data: { revoked, count: revoked.length },
      message: `${revoked.length} token(s) revoked successfully`
    });
  })
);

// ================================================================================
// POLICY MANAGEMENT
// ================================================================================

// Create access policy
router.post('/policies',
  adminLimiter,
  ...requireWrite('/admin'),
  asyncHandler(async (req, res) => {
    const actor = req.user?.username || req.user?.id || 'admin';

    const { error, value } = createPolicySchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const policy = await AccessPolicy.create({
      ...value,
      createdBy: actor,
      status: 'active'
    });

    res.status(201).json({
      success: true,
      data: policy,
      message: 'Access policy created successfully'
    });
  })
);

// List policies
router.get('/policies',
  adminLimiter,
  ...requireRead('/admin'),
  asyncHandler(async (req, res) => {
    const { policyType, status, aiSuggested } = req.query;

    const where = {};
    if (policyType) where.policyType = policyType;
    if (status) where.status = status;
    if (aiSuggested !== undefined) where.aiSuggested = aiSuggested === 'true';

    const policies = await AccessPolicy.findAll({
      where,
      order: [['priority', 'DESC'], ['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: policies,
      count: policies.length
    });
  })
);

// Get policy details
router.get('/policies/:policyId',
  adminLimiter,
  ...requireRead('/admin'),
  asyncHandler(async (req, res) => {
    const { policyId } = req.params;

    const policy = await AccessPolicy.findByPk(policyId, {
      include: [{
        model: TokenBinding,
        as: 'bindings',
        include: [{ model: VaultToken, as: 'token' }]
      }]
    });

    if (!policy) {
      throw new AppError('Policy not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: policy
    });
  })
);

// Update policy
router.put('/policies/:policyId',
  adminLimiter,
  ...requireWrite('/admin'),
  asyncHandler(async (req, res) => {
    const { policyId } = req.params;

    const policy = await AccessPolicy.findByPk(policyId);
    if (!policy) {
      throw new AppError('Policy not found', 404, 'NOT_FOUND');
    }

    const allowed = ['description', 'rules', 'priority', 'enforcementMode', 'status'];
    const updates = {};
    allowed.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    await policy.update(updates);

    res.json({
      success: true,
      data: policy,
      message: 'Policy updated successfully'
    });
  })
);

// Delete policy
router.delete('/policies/:policyId',
  adminLimiter,
  ...requireDelete('/admin'),
  asyncHandler(async (req, res) => {
    const { policyId } = req.params;

    const policy = await AccessPolicy.findByPk(policyId);
    if (!policy) {
      throw new AppError('Policy not found', 404, 'NOT_FOUND');
    }

    await policy.destroy();

    res.json({
      success: true,
      message: 'Policy deleted successfully'
    });
  })
);

// Get AI policy suggestions
router.post('/policies/suggest',
  adminLimiter,
  ...requireRead('/admin'),
  asyncHandler(async (req, res) => {
    const { entityType, entityId } = req.body;

    if (!entityType || !entityId) {
      throw new AppError('entityType and entityId are required', 400, 'VALIDATION_ERROR');
    }

    const suggestions = await aiPolicyService.suggestPolicies(entityType, entityId);

    res.json({
      success: true,
      data: suggestions,
      count: suggestions.length
    });
  })
);

// ================================================================================
// DASHBOARD & ANALYTICS
// ================================================================================

// Get dashboard statistics
router.get('/dashboard/stats',
  adminLimiter,
  ...requireRead('/admin'),
  asyncHandler(async (req, res) => {
    const [tokenStats, secretStats, keyStats, cacheStats] = await Promise.all([
      VaultToken.findAll({
        attributes: [
          'status',
          [VaultToken.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['status']
      }),
      Secret.count(),
      EncryptionKey.count(),
      redisCache.getStats()
    ]);

    // Risk distribution
    const riskDistribution = await aiPolicyService._getRiskDistribution();

    res.json({
      success: true,
      data: {
        tokens: {
          byStatus: tokenStats.reduce((acc, s) => {
            acc[s.status] = parseInt(s.dataValues.count);
            return acc;
          }, {}),
          total: tokenStats.reduce((sum, s) => sum + parseInt(s.dataValues.count), 0)
        },
        secrets: { total: secretStats },
        keys: { total: keyStats },
        cache: cacheStats,
        risk: riskDistribution
      }
    });
  })
);

// Get access report
router.post('/reports/access',
  adminLimiter,
  ...requireRead('/admin'),
  asyncHandler(async (req, res) => {
    const { startDate, endDate, entityType, entityId } = req.body;

    const report = await aiPolicyService.generateAccessReport({
      startDate: startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate: endDate ? new Date(endDate) : new Date(),
      entityType,
      entityId
    });

    res.json({
      success: true,
      data: report
    });
  })
);

// Detect anomalies for token
router.get('/tokens/:tokenId/anomalies',
  adminLimiter,
  ...requireRead('/admin'),
  asyncHandler(async (req, res) => {
    const { tokenId } = req.params;

    const result = await aiPolicyService.detectAnomalies(tokenId);

    res.json({
      success: true,
      data: result
    });
  })
);

// Purge expired tokens
router.post('/maintenance/purge',
  adminLimiter,
  ...requireWrite('/admin'),
  asyncHandler(async (req, res) => {
    const purged = await tokenService.purgeExpiredTokens();

    res.json({
      success: true,
      data: { purged },
      message: `${purged} expired token(s) purged successfully`
    });
  })
);

// Clear Redis cache
router.post('/maintenance/cache/clear',
  adminLimiter,
  ...requireWrite('/admin'),
  asyncHandler(async (req, res) => {
    const cleared = await redisCache.clearAll();

    res.json({
      success: true,
      data: { cleared },
      message: `${cleared} cached token(s) cleared`
    });
  })
);

module.exports = router;
