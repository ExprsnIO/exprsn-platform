/**
 * ═══════════════════════════════════════════════════════════════════════
 * Contributors Routes - Album Contributor Management
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const albumService = require('../services/albumService');
const { requireToken, auditAction } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * POST /api/albums/:albumId/contributors - Add contributor to album
 */
router.post('/albums/:albumId/contributors',
  requireToken({ write: true }),
  auditAction('contributor_added', 'contributor'),
  async (req, res) => {
    try {
      const { albumId } = req.params;
      const { userId, role = 'viewer' } = req.body;

      if (!userId) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'userId is required'
        });
      }

      const contributor = await albumService.addContributor(
        albumId,
        userId,
        role,
        req.userId
      );

      res.status(201).json({ contributor });

    } catch (error) {
      logger.error('Add contributor error:', error);

      if (error.message.includes('not authorized') || error.message.includes('Invalid role')) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: error.message
        });
      }

      if (error.message.includes('already a contributor')) {
        return res.status(409).json({
          error: 'CONFLICT',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to add contributor'
      });
    }
  }
);

/**
 * GET /api/albums/:albumId/contributors - List album contributors
 */
router.get('/albums/:albumId/contributors',
  requireToken({ read: true }),
  async (req, res) => {
    try {
      const { albumId } = req.params;

      // Check access to album
      const access = await albumService.checkAccess(albumId, req.userId, 'read');
      if (!access.hasAccess) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access denied'
        });
      }

      const contributors = await albumService.getContributors(albumId);

      res.json({ contributors });

    } catch (error) {
      logger.error('List contributors error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to list contributors'
      });
    }
  }
);

/**
 * PUT /api/albums/:albumId/contributors/:userId - Update contributor role
 */
router.put('/albums/:albumId/contributors/:userId',
  requireToken({ update: true }),
  auditAction('contributor_updated', 'contributor'),
  async (req, res) => {
    try {
      const { albumId, userId } = req.params;
      const { role } = req.body;

      if (!role) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'role is required'
        });
      }

      const contributor = await albumService.updateContributorRole(
        albumId,
        userId,
        role,
        req.userId
      );

      res.json({ contributor });

    } catch (error) {
      logger.error('Update contributor error:', error);

      if (error.message.includes('not authorized') ||
          error.message.includes('Invalid role') ||
          error.message.includes('Only album owner')) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: error.message
        });
      }

      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to update contributor'
      });
    }
  }
);

/**
 * DELETE /api/albums/:albumId/contributors/:userId - Remove contributor
 */
router.delete('/albums/:albumId/contributors/:userId',
  requireToken({ delete: true }),
  auditAction('contributor_removed', 'contributor'),
  async (req, res) => {
    try {
      const { albumId, userId } = req.params;

      await albumService.removeContributor(albumId, userId, req.userId);

      res.json({
        success: true,
        message: 'Contributor removed'
      });

    } catch (error) {
      logger.error('Remove contributor error:', error);

      if (error.message.includes('Only album owner') ||
          error.message.includes('Cannot remove')) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: error.message
        });
      }

      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to remove contributor'
      });
    }
  }
);

/**
 * GET /api/contributors/albums - Get albums where user is a contributor
 */
router.get('/contributors/albums',
  requireToken({ read: true }),
  async (req, res) => {
    try {
      const { limit = 50, offset = 0, role } = req.query;

      const albums = await albumService.getContributorAlbums(req.userId, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        role
      });

      res.json({ albums });

    } catch (error) {
      logger.error('Get contributor albums error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get albums'
      });
    }
  }
);

module.exports = router;
