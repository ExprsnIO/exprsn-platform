/**
 * ═══════════════════════════════════════════════════════════
 * Internal (service-to-service) Routes
 *
 * These endpoints are reachable ONLY with a valid per-service HMAC credential
 * (X-Service-ID / X-Service-Token, verified as HMAC-SHA256(serviceId,
 * SERVICE_TOKEN_SECRET)). They MUST NOT accept end-user CA tokens. They exist so
 * other platform modules can resolve group authorization without re-implementing
 * nexus's membership model. See shared requireGroupMembership().
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Group, GroupMembership } = require('../models');
const { requireServiceToken } = require('../middleware/tokenAuth');
const logger = require('../utils/logger');

// Every internal route requires service-to-service authentication.
router.use(requireServiceToken);

/**
 * GET /api/internal/groups/:id/membership/:userId
 *
 * Resolve a user's membership in a group for cross-module authorization.
 * Returns: { isMember, role, visibility, joinMode }
 *   - isMember:   true if the user has an active membership row
 *   - role:       membership role (owner/admin/moderator/member) or null
 *   - visibility: group visibility (public/private/unlisted)
 *   - joinMode:   group join mode (open/request/invite)
 * Returns 404 if the group does not exist.
 */
router.get('/groups/:id/membership/:userId', async (req, res) => {
  const { id: groupId, userId } = req.params;

  try {
    const group = await Group.findByPk(groupId, {
      attributes: ['id', 'visibility', 'joinMode', 'isActive']
    });

    if (!group) {
      return res.status(404).json({
        error: 'GROUP_NOT_FOUND',
        message: 'Group not found'
      });
    }

    const membership = await GroupMembership.findOne({
      where: { groupId, userId, status: 'active' },
      attributes: ['role']
    });

    return res.json({
      isMember: !!membership,
      role: membership ? membership.role : null,
      visibility: group.visibility,
      joinMode: group.joinMode
    });
  } catch (error) {
    logger.error('Internal membership lookup failed', {
      groupId,
      userId,
      error: error.message
    });
    return res.status(500).json({
      error: 'MEMBERSHIP_LOOKUP_ERROR',
      message: 'Failed to resolve group membership'
    });
  }
});

/**
 * GET /api/internal/users/:userId/groups
 *
 * List the ids of groups a user is an ACTIVE member of, for cross-module data
 * isolation (e.g. low-code record visibility). Returns: { groupIds: string[] }.
 */
router.get('/users/:userId/groups', async (req, res) => {
  try {
    const rows = await GroupMembership.findAll({
      where: { userId: req.params.userId, status: 'active' },
      attributes: ['groupId'],
    });
    return res.json({ groupIds: rows.map((r) => r.groupId) });
  } catch (error) {
    logger.error('Internal group-ids lookup failed', { userId: req.params.userId, error: error.message });
    return res.status(500).json({ error: 'MEMBERSHIP_LOOKUP_ERROR', message: 'Failed to resolve group memberships' });
  }
});

module.exports = router;
