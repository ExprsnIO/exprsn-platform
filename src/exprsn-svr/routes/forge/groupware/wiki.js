const express = require('express');
const router = express.Router();
const { WikiPage } = require('../../../models/forge');
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const logger = require('../../../utils/logger');

// Validation schemas
const wikiPageCreateSchema = Joi.object({
  title: Joi.string().max(500).required(),
  slug: Joi.string().max(500).required(),
  content: Joi.string().required(),
  contentFormat: Joi.string().valid('markdown', 'html', 'plain').optional(),
  parentPageId: Joi.string().uuid().optional(),
  position: Joi.number().integer().optional(),
  status: Joi.string().valid('draft', 'published', 'archived').optional(),
  visibility: Joi.string().valid('public', 'private', 'restricted').optional(),
  category: Joi.string().max(100).optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  isTemplate: Joi.boolean().optional(),
  templateId: Joi.string().uuid().optional(),
  permissions: Joi.object().optional(),
  attachments: Joi.array().optional(),
  metadata: Joi.object().optional()
});

const wikiPageUpdateSchema = wikiPageCreateSchema.fork(
  ['title', 'slug', 'content'],
  (schema) => schema.optional()
);

// List wiki pages
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    search: Joi.string().optional(),
    category: Joi.string().optional(),
    parentPageId: Joi.string().uuid().optional(),
    status: Joi.string().valid('draft', 'published', 'archived').optional(),
    visibility: Joi.string().valid('public', 'private', 'restricted').optional(),
    isTemplate: Joi.boolean().optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, search, category, parentPageId, status, visibility, isTemplate, sortBy, sortOrder } = req.query;
      const offset = (page - 1) * limit;

      const where = {};

      if (category) where.category = category;
      if (parentPageId === 'null') {
        where.parentPageId = null;
      } else if (parentPageId) {
        where.parentPageId = parentPageId;
      }
      if (status) where.status = status;
      if (visibility) where.visibility = visibility;
      if (isTemplate !== undefined) where.isTemplate = isTemplate === 'true';

      // Search functionality
      if (search) {
        const { Op } = require('sequelize');
        where[Op.or] = [
          { title: { [Op.iLike]: `%${search}%` } },
          { searchableText: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await WikiPage.findAndCountAll({
        where,
        limit,
        offset,
        order: sortBy ? [[sortBy, sortOrder]] : [['position', 'ASC'], ['updatedAt', 'DESC']],
        attributes: { exclude: ['content', 'searchableText'] }
      });

      res.json({
        success: true,
        pages: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list wiki pages', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list wiki pages'
      });
    }
  }
);

// Get wiki page by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const page = await WikiPage.findByPk(req.params.id);

      if (!page) {
        return res.status(404).json({
          success: false,
          error: 'Wiki page not found'
        });
      }

      // Check visibility permissions
      if (page.visibility === 'private' && page.createdById !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Increment view count
      await page.update({
        viewCount: page.viewCount + 1,
        lastViewedAt: new Date()
      });

      res.json({
        success: true,
        page
      });
    } catch (error) {
      logger.error('Failed to get wiki page', { error: error.message, pageId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get wiki page'
      });
    }
  }
);

// Get wiki page by slug
router.get('/slug/:slug',
  
  requirePermission('read'),
  validateParams(Joi.object({
    slug: Joi.string().max(500).required()
  })),
  async (req, res) => {
    try {
      const page = await WikiPage.findOne({
        where: { slug: req.params.slug }
      });

      if (!page) {
        return res.status(404).json({
          success: false,
          error: 'Wiki page not found'
        });
      }

      // Check visibility permissions
      if (page.visibility === 'private' && page.createdById !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Increment view count
      await page.update({
        viewCount: page.viewCount + 1,
        lastViewedAt: new Date()
      });

      res.json({
        success: true,
        page
      });
    } catch (error) {
      logger.error('Failed to get wiki page by slug', { error: error.message, slug: req.params.slug });
      res.status(500).json({
        success: false,
        error: 'Failed to get wiki page'
      });
    }
  }
);

// Get page history
router.get('/:id/history',
  
  requirePermission('read'),
  validateParams(schemas.id),
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).optional().default(50)
  })),
  async (req, res) => {
    try {
      const { limit } = req.query;

      // Get current page and all previous versions
      const versions = [];
      let currentPage = await WikiPage.findByPk(req.params.id);

      if (!currentPage) {
        return res.status(404).json({
          success: false,
          error: 'Wiki page not found'
        });
      }

      versions.push(currentPage);

      // Follow the chain of previous versions
      let previousVersionId = currentPage.previousVersionId;
      while (previousVersionId && versions.length < limit) {
        const prevVersion = await WikiPage.findByPk(previousVersionId);
        if (!prevVersion) break;
        versions.push(prevVersion);
        previousVersionId = prevVersion.previousVersionId;
      }

      res.json({
        success: true,
        versions,
        total: versions.length
      });
    } catch (error) {
      logger.error('Failed to get page history', { error: error.message, pageId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get page history'
      });
    }
  }
);

// Get child pages
router.get('/:id/children',
  
  requirePermission('read'),
  validateParams(schemas.id),
  validateQuery(Joi.object({
    recursive: Joi.boolean().optional().default(false)
  })),
  async (req, res) => {
    try {
      const { recursive } = req.query;

      const children = await WikiPage.findAll({
        where: { parentPageId: req.params.id },
        order: [['position', 'ASC']],
        attributes: { exclude: ['content', 'searchableText'] }
      });

      // If recursive, get all descendants
      if (recursive) {
        const allDescendants = [...children];
        for (const child of children) {
          const descendants = await getDescendants(child.id);
          allDescendants.push(...descendants);
        }
        res.json({
          success: true,
          children: allDescendants
        });
      } else {
        res.json({
          success: true,
          children
        });
      }
    } catch (error) {
      logger.error('Failed to get child pages', { error: error.message, pageId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get child pages'
      });
    }
  }
);

// Helper function to get all descendants recursively
async function getDescendants(pageId) {
  const children = await WikiPage.findAll({
    where: { parentPageId: pageId },
    order: [['position', 'ASC']],
    attributes: { exclude: ['content', 'searchableText'] }
  });

  const descendants = [...children];
  for (const child of children) {
    const childDescendants = await getDescendants(child.id);
    descendants.push(...childDescendants);
  }
  return descendants;
}

// Create wiki page
router.post('/',
  
  requirePermission('write'),
  validateBody(wikiPageCreateSchema),
  async (req, res) => {
    try {
      // Calculate depth and path if parent exists
      let depth = 0;
      let path = `/${req.body.slug}`;

      if (req.body.parentPageId) {
        const parent = await WikiPage.findByPk(req.body.parentPageId);
        if (parent) {
          depth = parent.depth + 1;
          path = `${parent.path}/${req.body.slug}`;
        }
      }

      // Extract searchable text from content
      const searchableText = req.body.content
        .replace(/<[^>]*>/g, ' ') // Remove HTML tags
        .replace(/[#*_`]/g, '') // Remove markdown symbols
        .toLowerCase();

      const page = await WikiPage.create({
        ...req.body,
        createdById: req.user.id,
        lastEditedById: req.user.id,
        lastEditedAt: new Date(),
        depth,
        path,
        searchableText,
        contributors: [req.user.id]
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('wiki:page-created', { page: { id: page.id, title: page.title, slug: page.slug } });

      logger.info('Wiki page created', {
        pageId: page.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        page
      });
    } catch (error) {
      logger.error('Failed to create wiki page', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message.includes('unique') ? 'A page with this slug already exists' : 'Failed to create wiki page'
      });
    }
  }
);

// Update wiki page
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(wikiPageUpdateSchema),
  async (req, res) => {
    try {
      const page = await WikiPage.findByPk(req.params.id);

      if (!page) {
        return res.status(404).json({
          success: false,
          error: 'Wiki page not found'
        });
      }

      // Check edit permissions
      if (page.visibility === 'private' && page.createdById !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Check if page is locked
      if (page.lockedBy && page.lockedBy !== req.user.id) {
        return res.status(423).json({
          success: false,
          error: 'Page is locked by another user'
        });
      }

      // Create new version if content changed
      let updateData = { ...req.body };

      if (req.body.content && req.body.content !== page.content) {
        // Save current version as previous version
        const previousVersion = await WikiPage.create({
          ...page.toJSON(),
          id: undefined, // Let Sequelize generate new ID
          isLatestVersion: false,
          version: page.version,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt
        });

        updateData.version = page.version + 1;
        updateData.previousVersionId = previousVersion.id;

        // Update searchable text
        updateData.searchableText = req.body.content
          .replace(/<[^>]*>/g, ' ')
          .replace(/[#*_`]/g, '')
          .toLowerCase();
      }

      // Update contributors
      const contributors = page.contributors || [];
      if (!contributors.includes(req.user.id)) {
        updateData.contributors = [...contributors, req.user.id];
      }

      updateData.lastEditedById = req.user.id;
      updateData.lastEditedAt = new Date();
      updateData.editCount = page.editCount + 1;

      await page.update(updateData);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('wiki:page-updated', { page: { id: page.id, title: page.title } });

      logger.info('Wiki page updated', {
        pageId: page.id,
        userId: req.user.id,
        newVersion: updateData.version || page.version
      });

      res.json({
        success: true,
        page
      });
    } catch (error) {
      logger.error('Failed to update wiki page', { error: error.message, pageId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to update wiki page'
      });
    }
  }
);

// Delete wiki page
router.delete('/:id',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const page = await WikiPage.findByPk(req.params.id);

      if (!page) {
        return res.status(404).json({
          success: false,
          error: 'Wiki page not found'
        });
      }

      // Check if page has children
      const childCount = await WikiPage.count({
        where: { parentPageId: page.id }
      });

      if (childCount > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete page with child pages. Delete or move child pages first.'
        });
      }

      await page.destroy();

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('wiki:page-deleted', { pageId: page.id });

      logger.info('Wiki page deleted', {
        pageId: page.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Wiki page deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete wiki page', { error: error.message, pageId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to delete wiki page'
      });
    }
  }
);

// Publish wiki page
router.post('/:id/publish',
  
  requirePermission('update'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const page = await WikiPage.findByPk(req.params.id);

      if (!page) {
        return res.status(404).json({
          success: false,
          error: 'Wiki page not found'
        });
      }

      if (page.status === 'published') {
        return res.status(400).json({
          success: false,
          error: 'Page is already published'
        });
      }

      await page.update({
        status: 'published',
        publishedAt: new Date()
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('wiki:page-published', { page: { id: page.id, title: page.title } });

      logger.info('Wiki page published', {
        pageId: page.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        page
      });
    } catch (error) {
      logger.error('Failed to publish wiki page', { error: error.message, pageId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to publish wiki page'
      });
    }
  }
);

// Lock/unlock page for editing
router.post('/:id/lock',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    locked: Joi.boolean().required()
  })),
  async (req, res) => {
    try {
      const page = await WikiPage.findByPk(req.params.id);

      if (!page) {
        return res.status(404).json({
          success: false,
          error: 'Wiki page not found'
        });
      }

      // If locking, set current user as lock holder
      // If unlocking, only allow if current user holds the lock
      if (req.body.locked) {
        if (page.lockedBy && page.lockedBy !== req.user.id) {
          return res.status(423).json({
            success: false,
            error: 'Page is already locked by another user'
          });
        }
        await page.update({
          lockedBy: req.user.id,
          lockedAt: new Date()
        });
      } else {
        if (page.lockedBy !== req.user.id) {
          return res.status(403).json({
            success: false,
            error: 'Only the user who locked the page can unlock it'
          });
        }
        await page.update({
          lockedBy: null,
          lockedAt: null
        });
      }

      logger.info('Wiki page lock status changed', {
        pageId: page.id,
        userId: req.user.id,
        locked: req.body.locked
      });

      res.json({
        success: true,
        page
      });
    } catch (error) {
      logger.error('Failed to change lock status', { error: error.message, pageId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to change lock status'
      });
    }
  }
);

module.exports = router;
