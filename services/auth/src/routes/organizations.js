/**
 * ═══════════════════════════════════════════════════════════
 * Organization Routes
 * Organization management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const organizationService = require('../services/organizationService');
const rbacService = require('../services/rbacService');
const { requireAuth } = require('../middleware/requireAuth');

/**
 * POST /api/organizations
 * Create new organization
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const org = await organizationService.createOrganization(req.body, req.user.id);

    res.status(201).json({
      success: true,
      organization: org
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/organizations
 * Get user's organizations
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const orgs = await organizationService.getUserOrganizations(req.user.id);

    // ?include=counts enriches each org with { groups, users, violations } so
    // the admin table can sort on them. Groups/users come from the auth
    // schema; violations are the org members' moderation items in a violating
    // state (rejected/flagged/escalated) from the moderator schema — best
    // effort, 0 when that schema isn't available.
    const wantCounts = String(req.query.include || '').split(',').includes('counts');
    if (!wantCounts || orgs.length === 0) {
      return res.json({ success: true, organizations: orgs });
    }

    const { sequelize } = require('../models');
    const ids = orgs.map((o) => o.id);
    const countMap = {};
    for (const id of ids) countMap[id] = { groups: 0, users: 0, violations: 0 };

    // NB: auth-schema columns are camelCase (no global underscored) — quote
    // them; the moderator schema maps to snake_case.
    const [groupRows] = await sequelize.query(
      'SELECT "organizationId" AS oid, COUNT(*)::int AS n FROM auth.groups WHERE "organizationId" IN (:ids) GROUP BY "organizationId"',
      { replacements: { ids } }
    );
    for (const r of groupRows) if (countMap[r.oid]) countMap[r.oid].groups = r.n;

    const [memberRows] = await sequelize.query(
      'SELECT "organizationId" AS oid, COUNT(DISTINCT "userId")::int AS n FROM auth.organization_members WHERE "organizationId" IN (:ids) GROUP BY "organizationId"',
      { replacements: { ids } }
    );
    for (const r of memberRows) if (countMap[r.oid]) countMap[r.oid].users = r.n;

    try {
      const [violationRows] = await sequelize.query(
        `SELECT om."organizationId" AS oid, COUNT(*)::int AS n
           FROM moderator.moderation_items mi
           JOIN auth.organization_members om ON om."userId" = mi.user_id
          WHERE om."organizationId" IN (:ids)
            AND mi.status IN ('rejected', 'flagged', 'escalated')
          GROUP BY om."organizationId"`,
        { replacements: { ids } }
      );
      for (const r of violationRows) if (countMap[r.oid]) countMap[r.oid].violations = r.n;
    } catch (_) { /* moderator schema unavailable — leave 0s */ }

    res.json({
      success: true,
      organizations: orgs.map((o) => {
        const json = o.toJSON ? o.toJSON() : o;
        return { ...json, counts: countMap[json.id] };
      })
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/organizations/:id
 * Get organization by ID
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    // Check if user is a member
    const isMember = await organizationService.isMember(req.params.id, req.user.id);

    if (!isMember) {
      const hasPermission = await rbacService.checkPermission(req.user.id, 'org:read');
      if (!hasPermission.allowed) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You do not have access to this organization'
        });
      }
    }

    const org = await organizationService.getOrganizationById(req.params.id, {
      includeMembers: req.query.include_members === 'true',
      includeGroups: req.query.include_groups === 'true',
      includeApplications: req.query.include_applications === 'true'
    });

    res.json({
      success: true,
      organization: org
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/organizations/:id
 * Update organization
 */
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    // Check if user is owner or admin
    const isOwnerOrAdmin = await organizationService.isOwnerOrAdmin(req.params.id, req.user.id);

    if (!isOwnerOrAdmin) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only organization owners and admins can update settings'
      });
    }

    const org = await organizationService.updateOrganization(req.params.id, req.body);

    res.json({
      success: true,
      organization: org
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/organizations/:id
 * Delete organization
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const org = await organizationService.getOrganizationById(req.params.id);

    // Only owner can delete
    if (org.ownerId !== req.user.id) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only organization owner can delete the organization'
      });
    }

    await organizationService.deleteOrganization(req.params.id);

    res.json({
      success: true,
      message: 'Organization deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/organizations/:id/members
 * Get organization members
 */
router.get('/:id/members', requireAuth, async (req, res, next) => {
  try {
    const isMember = await organizationService.isMember(req.params.id, req.user.id);

    if (!isMember) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You must be a member to view members'
      });
    }

    const members = await organizationService.getMembers(req.params.id, {
      status: req.query.status,
      role: req.query.role
    });

    res.json({
      success: true,
      members
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/organizations/:id/members
 * Add member to organization
 */
router.post('/:id/members', requireAuth, async (req, res, next) => {
  try {
    const isOwnerOrAdmin = await organizationService.isOwnerOrAdmin(req.params.id, req.user.id);

    if (!isOwnerOrAdmin) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only owners and admins can add members'
      });
    }

    const { userId, role } = req.body;

    const member = await organizationService.addMember(req.params.id, userId, {
      role,
      invitedBy: req.user.id
    });

    res.status(201).json({
      success: true,
      member
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/organizations/:id/members/:userId
 * Remove member from organization
 */
router.delete('/:id/members/:userId', requireAuth, async (req, res, next) => {
  try {
    const isOwnerOrAdmin = await organizationService.isOwnerOrAdmin(req.params.id, req.user.id);

    if (!isOwnerOrAdmin && req.params.userId !== req.user.id) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only owners and admins can remove members'
      });
    }

    await organizationService.removeMember(req.params.id, req.params.userId);

    res.json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/organizations/:id/members/:userId
 * Update member role
 */
router.patch('/:id/members/:userId', requireAuth, async (req, res, next) => {
  try {
    const isOwnerOrAdmin = await organizationService.isOwnerOrAdmin(req.params.id, req.user.id);

    if (!isOwnerOrAdmin) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only owners and admins can update member roles'
      });
    }

    const { role } = req.body;

    const member = await organizationService.updateMemberRole(req.params.id, req.params.userId, role);

    res.json({
      success: true,
      member
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/organizations/:id/transfer-ownership
 * Transfer organization ownership
 */
router.post('/:id/transfer-ownership', requireAuth, async (req, res, next) => {
  try {
    const { newOwnerId } = req.body;

    const org = await organizationService.transferOwnership(
      req.params.id,
      req.user.id,
      newOwnerId
    );

    res.json({
      success: true,
      organization: org
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
