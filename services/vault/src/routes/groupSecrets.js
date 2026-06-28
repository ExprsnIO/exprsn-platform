/**
 * ═══════════════════════════════════════════════════════════════════════
 * Group Secret Routes (Phase 6 — Shared keys / secrets for groups)
 *
 * Group-scoped, membership-gated access to the SecretGroupAccess ACL. Every
 * route runs:
 *   validateCAToken         -> sets req.userId (CA token, vault read perm)
 *   requireGroupMembership  -> 403 non-member / 404 unknown group / 503 nexus down
 *                              ('admin' minimum for share/revoke/reveal per the
 *                              permission matrix: "Manage group secrets" = owner/admin)
 *
 * SECURITY (HIGHEST SENSITIVITY):
 *   - The list route returns METADATA ONLY — never encryptedValue, iv, authTag,
 *     or plaintext.
 *   - Plaintext is returned ONLY by the explicit, admin-only /reveal route,
 *     which requires a live ACL grant and writes a dedicated audit row.
 *
 * Relationship to VaultToken: the ACL is the grant ledger + the credential for
 * these membership-gated routes; a group's VaultToken (entityType:'group')
 * remains the bearer credential for raw path access via /api/secrets/:path.
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { asyncHandler, AppError, createRateLimiter, validateCAToken, requireGroupMembership } = require('@exprsn/shared');
const groupSecretService = require('../services/groupSecretService');

// CA-token gate that sets req.userId for the membership guard. Group ACL +
// membership role are the authorization mechanism here, so we do NOT apply the
// per-token resource path scope (enforceResourceScope) used by /api/secrets.
const requireUser = validateCAToken({ requiredPermissions: ['read'], resourceType: 'vault' });

const strictLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyPrefix: 'vault:group:strict'
});

const readLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  keyPrefix: 'vault:group:read'
});

const shareSchema = Joi.object({
  permission: Joi.string().valid('read', 'write', 'manage').default('read'),
  expiresAt: Joi.date().optional().allow(null)
});

/**
 * List secrets shared with a group — METADATA ONLY (never plaintext).
 * GET /api/groups/:groupId/secrets
 * Guard: member
 */
router.get('/:groupId/secrets',
  readLimiter,
  requireUser,
  requireGroupMembership(),
  asyncHandler(async (req, res) => {
    const secrets = await groupSecretService.listGroupSecrets(req.params.groupId);
    res.json({
      success: true,
      data: secrets,
      count: secrets.length
    });
  })
);

/**
 * Explicit, admin-only reveal of a single secret's plaintext.
 * GET /api/groups/:groupId/secrets/:path(*)/reveal
 * Guard: admin (+ live ACL grant for the group)
 */
router.get('/:groupId/secrets/:path(*)/reveal',
  strictLimiter,
  requireUser,
  requireGroupMembership('admin'),
  asyncHandler(async (req, res) => {
    const path = '/' + req.params.path;
    const actor = req.userId || 'service';
    const secret = await groupSecretService.revealSecret(
      { groupId: req.params.groupId, path },
      actor
    );
    res.json({
      success: true,
      data: secret
    });
  })
);

/**
 * Grant a group access to an existing secret.
 * POST /api/groups/:groupId/secrets/:path(*)/share
 * Body: { permission: 'read'|'write'|'manage', expiresAt? }
 * Guard: admin
 */
router.post('/:groupId/secrets/:path(*)/share',
  strictLimiter,
  requireUser,
  requireGroupMembership('admin'),
  asyncHandler(async (req, res) => {
    const path = '/' + req.params.path;
    const actor = req.userId || 'service';

    const { error, value } = shareSchema.validate(req.body || {});
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const grant = await groupSecretService.shareSecret(
      {
        groupId: req.params.groupId,
        path,
        permission: value.permission,
        expiresAt: value.expiresAt || null
      },
      actor
    );

    res.status(201).json({
      success: true,
      data: grant,
      message: 'Secret shared with group'
    });
  })
);

/**
 * Revoke a group's access to a secret.
 * DELETE /api/groups/:groupId/secrets/:path(*)/share
 * Guard: admin
 */
router.delete('/:groupId/secrets/:path(*)/share',
  strictLimiter,
  requireUser,
  requireGroupMembership('admin'),
  asyncHandler(async (req, res) => {
    const path = '/' + req.params.path;
    const actor = req.userId || 'service';

    await groupSecretService.revokeSecret(
      { groupId: req.params.groupId, path },
      actor
    );

    res.json({
      success: true,
      message: 'Group access revoked'
    });
  })
);

module.exports = router;
