/**
 * ═══════════════════════════════════════════════════════════
 * Internal (service-to-service) Routes — organization authorization.
 *
 * Reachable ONLY with a valid per-service HMAC credential (X-Service-ID /
 * X-Service-Token = HMAC-SHA256(serviceId, SERVICE_TOKEN_SECRET)). They MUST NOT
 * accept end-user bearer tokens. They exist so other modules (e.g. low-code) can
 * resolve organization authorization without re-implementing the membership
 * model — mirroring nexus's /api/internal/groups/:id/membership/:userId.
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { verifyServiceToken } = require('@exprsn/shared/utils/serviceToken');
const db = require('../models');

const { Organization, OrganizationMember } = db;

// Every internal route requires service-to-service authentication.
router.use((req, res, next) => {
  const serviceId = req.get('X-Service-ID') || '';
  const token = req.get('X-Service-Token') || '';
  if (!serviceId || !verifyServiceToken(serviceId, token)) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Valid service token required' });
  }
  next();
});

/**
 * GET /api/internal/orgs/:orgId/membership/:userId
 *
 * Resolve a user's membership in an organization for cross-module authorization.
 * Returns: { isMember, role, isOwner }
 *   - isMember: true if the user has an ACTIVE membership row (or is the owner)
 *   - role:     'owner' | 'admin' | 'member' | 'guest' | null
 *   - isOwner:  true if the user is the organization's owner
 * Returns 404 if the organization does not exist.
 */
router.get('/orgs/:orgId/membership/:userId', async (req, res) => {
  const { orgId, userId } = req.params;
  try {
    const org = await Organization.findByPk(orgId, { attributes: ['id', 'ownerId', 'status'] });
    if (!org) return res.status(404).json({ error: 'ORG_NOT_FOUND', message: 'Organization not found' });

    const isOwner = String(org.ownerId) === String(userId);
    const member = await OrganizationMember.findOne({
      where: { organizationId: orgId, userId, status: 'active' },
      attributes: ['role'],
    });

    return res.json({
      isMember: isOwner || !!member,
      role: isOwner ? 'owner' : (member ? member.role : null),
      isOwner,
    });
  } catch (error) {
    return res.status(500).json({ error: 'MEMBERSHIP_LOOKUP_ERROR', message: 'Failed to resolve organization membership' });
  }
});

/**
 * GET /api/internal/users/:userId/orgs
 *
 * List the ids of organizations a user belongs to (owned OR active member), for
 * cross-module data isolation (e.g. low-code record visibility).
 * Returns: { orgIds: string[] }.
 */
router.get('/users/:userId/orgs', async (req, res) => {
  const { userId } = req.params;
  try {
    const [owned, memberships] = await Promise.all([
      Organization.findAll({ where: { ownerId: userId }, attributes: ['id'] }),
      OrganizationMember.findAll({ where: { userId, status: 'active' }, attributes: ['organizationId'] }),
    ]);
    const ids = new Set([...owned.map((o) => o.id), ...memberships.map((m) => m.organizationId)]);
    return res.json({ orgIds: [...ids] });
  } catch (error) {
    return res.status(500).json({ error: 'MEMBERSHIP_LOOKUP_ERROR', message: 'Failed to resolve organization memberships' });
  }
});

module.exports = router;
