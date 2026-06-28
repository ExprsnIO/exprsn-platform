const express = require('express');
const router = express.Router();
const { requireToken } = require('../middleware/tokenAuth');
const { requireAdmin } = require('@exprsn/shared');
const { Group, AdminAudit } = require('../models');
const adminAnalyticsService = require('../services/adminAnalyticsService');

/**
 * ═══════════════════════════════════════════════════════════
 * Admin Console Routes (platform-admin only)
 * Analytics (Phase 4) + audit log (Phase 5).
 * Every route requires a valid CA token whose role is 'admin'.
 * ═══════════════════════════════════════════════════════════
 */
router.use(requireToken(), requireAdmin());

/**
 * GET /api/admin/stats
 * Platform-wide totals + growth series.
 * Query: period=7d|30d|90d (or days=N). Defaults to 30d.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await adminAnalyticsService.getPlatformStats(req.query);
    res.json({ success: true, ...stats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/groups/:id/stats
 * Per-group totals, member growth, and recent activity.
 * Query: period=7d|30d|90d (or days=N). Defaults to 30d.
 */
router.get('/groups/:id/stats', async (req, res, next) => {
  try {
    const group = await Group.findByPk(req.params.id, {
      attributes: ['id', 'name', 'slug', 'visibility', 'isActive', 'memberCount', 'createdAt']
    });
    if (!group) {
      return res.status(404).json({ error: 'GROUP_NOT_FOUND', message: 'Group not found' });
    }

    const stats = await adminAnalyticsService.getGroupStats(req.params.id, req.query);
    res.json({
      success: true,
      group: {
        id: group.id,
        name: group.name,
        slug: group.slug,
        visibility: group.visibility,
        isActive: group.isActive,
        createdAt: group.createdAt
      },
      ...stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/audit
 * Filterable, newest-first list of recorded admin actions.
 * Query: actor?, action?, targetType?, groupId?, limit (<=200), offset.
 */
router.get('/audit', async (req, res, next) => {
  try {
    const {
      actor,
      action,
      targetType,
      groupId,
      limit = 50,
      offset = 0
    } = req.query;

    const where = {};
    if (actor) where.actorUserId = actor;
    if (action) where.action = action;
    if (targetType) where.targetType = targetType;
    if (groupId) where.groupId = groupId;

    const parsedLimit = Math.min(parseInt(limit, 10) || 50, 200);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const { rows, count } = await AdminAudit.findAndCountAll({
      where,
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: parsedLimit,
      offset: parsedOffset
    });

    res.json({
      success: true,
      entries: rows,
      total: count,
      limit: parsedLimit,
      offset: parsedOffset
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
