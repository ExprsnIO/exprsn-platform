/**
 * ═══════════════════════════════════════════════════════════════════════
 * Album Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const Album = require('../models/Album');
const albumService = require('../services/albumService');
const { requireToken, auditAction } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * POST /api/albums - Create new album
 */
router.post('/',
  requireToken({ write: true }),
  auditAction('album_created', 'album'),
  async (req, res) => {
    try {
      const { name, description, visibility, layout, tags, settings } = req.body;

      if (!name) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Album name is required'
        });
      }

      const album = await albumService.createAlbum({
        name,
        description,
        visibility: visibility || 'private',
        layout: layout || 'grid',
        tags: tags || [],
        settings: settings || {}
      }, req.userId);

      res.status(201).json({ album });

    } catch (error) {
      logger.error('Create album error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to create album'
      });
    }
  }
);

/**
 * GET /api/albums/:id - Get album details
 */
router.get('/:id',
  requireToken({ read: true }),
  auditAction('album_viewed', 'album'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const includeMedia = req.query.includeMedia === 'true';

      let album;
      if (includeMedia) {
        album = await albumService.getAlbumWithMedia(id, {
          mediaLimit: parseInt(req.query.limit) || 100,
          mediaOffset: parseInt(req.query.offset) || 0
        });
      } else {
        album = await Album.getWithStats(id);
      }

      if (!album) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Album not found'
        });
      }

      // Check access
      const access = await albumService.checkAccess(id, req.userId, 'read');
      if (!access.hasAccess) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: access.reason || 'Access denied'
        });
      }

      // Increment view count
      await Album.incrementViewCount(id);

      res.json({ album });

    } catch (error) {
      logger.error('Get album error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get album'
      });
    }
  }
);

/**
 * PUT /api/albums/:id - Update album
 */
router.put('/:id',
  requireToken({ update: true }),
  auditAction('album_updated', 'album'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const album = await albumService.updateAlbum(id, updates, req.userId);

      res.json({ album });

    } catch (error) {
      logger.error('Update album error:', error);

      if (error.message === 'Album not found') {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: error.message
        });
      }

      if (error.message.includes('Not authorized')) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to update album'
      });
    }
  }
);

/**
 * DELETE /api/albums/:id - Delete album
 */
router.delete('/:id',
  requireToken({ delete: true }),
  auditAction('album_deleted', 'album'),
  async (req, res) => {
    try {
      const { id } = req.params;

      await albumService.deleteAlbum(id, req.userId);

      res.json({
        success: true,
        message: 'Album deleted'
      });

    } catch (error) {
      logger.error('Delete album error:', error);

      if (error.message === 'Album not found') {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: error.message
        });
      }

      if (error.message.includes('Not authorized')) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to delete album'
      });
    }
  }
);

/**
 * GET /api/albums - Get user's albums
 */
router.get('/',
  requireToken({ read: true }),
  async (req, res) => {
    try {
      const userId = req.query.userId || req.userId;
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const visibility = req.query.visibility;

      const albums = await Album.findByOwner(userId, {
        limit,
        offset,
        visibility
      });

      res.json({
        albums,
        pagination: {
          limit,
          offset,
          total: albums.length
        }
      });

    } catch (error) {
      logger.error('Get albums error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get albums'
      });
    }
  }
);

/**
 * GET /api/albums/public - Get public albums
 */
router.get('/public/list',
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      const albums = await Album.getPublicAlbums({ limit, offset });

      res.json({
        albums,
        pagination: {
          limit,
          offset,
          total: albums.length
        }
      });

    } catch (error) {
      logger.error('Get public albums error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get public albums'
      });
    }
  }
);

/**
 * GET /api/albums/search - Search albums
 */
router.get('/search',
  requireToken({ read: true }),
  async (req, res) => {
    try {
      const { q: searchTerm, limit = 50, offset = 0 } = req.query;

      if (!searchTerm) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Search term required'
        });
      }

      const albums = await Album.search(searchTerm, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        albums,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: albums.length
        }
      });

    } catch (error) {
      logger.error('Search albums error:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to search albums'
      });
    }
  }
);

module.exports = router;
