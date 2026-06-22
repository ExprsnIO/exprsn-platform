const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { requireToken } = require('../middleware/tokenAuth');
const membershipService = require('../services/membershipService');

/**
 * ═══════════════════════════════════════════════════════════
 * Membership Routes
 * User-specific membership management
 * ═══════════════════════════════════════════════════════════
 */

/**
 * GET /api/memberships
 * Get current user's group memberships
 * Query params: status, role, page, limit
 */
router.get('/',
  requireToken(),
  async (req, res, next) => {
    try {
      const schema = Joi.object({
        status: Joi.string().valid('active', 'pending', 'suspended', 'banned', 'left').default('active'),
        role: Joi.string().valid('owner', 'admin', 'moderator', 'member'),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(50)
      });

      const { error, value } = schema.validate(req.query);

      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const { status, role, page, limit } = value;
      const userId = req.user.id;

      const result = await membershipService.getUserMemberships(
        userId,
        { status, role },
        { page, limit }
      );

      res.json({
        success: true,
        data: result.memberships,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
