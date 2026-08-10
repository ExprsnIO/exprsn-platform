const express = require('express');
const router = express.Router();
const { Note, Folder } = require('../../../models/forge');
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const logger = require('../../../utils/logger');

// Validation schemas
const noteCreateSchema = Joi.object({
  title: Joi.string().max(500).optional(),
  content: Joi.string().required(),
  contentFormat: Joi.string().valid('plain', 'markdown', 'html').optional(),
  noteType: Joi.string().valid('note', 'snippet', 'checklist', 'bookmark').optional(),
  folderId: Joi.string().uuid().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  isPinned: Joi.boolean().optional(),
  isFavorite: Joi.boolean().optional(),
  isShared: Joi.boolean().optional(),
  sharedWith: Joi.array().items(Joi.string().uuid()).optional(),
  sharePermissions: Joi.string().valid('view', 'edit').optional(),
  relatedEntityType: Joi.string().max(100).optional(),
  relatedEntityId: Joi.string().uuid().optional(),
  hasReminder: Joi.boolean().optional(),
  reminderAt: Joi.date().iso().optional(),
  checklistItems: Joi.array().items(Joi.object({
    id: Joi.string().required(),
    text: Joi.string().required(),
    completed: Joi.boolean().required(),
    position: Joi.number().integer().required()
  })).optional(),
  language: Joi.string().max(50).optional(),
  url: Joi.string().uri().max(2000).optional(),
  isEncrypted: Joi.boolean().optional(),
  attachments: Joi.array().optional(),
  color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional(),
  metadata: Joi.object().optional()
});

const noteUpdateSchema = noteCreateSchema.fork(
  ['content'],
  (schema) => schema.optional()
);

// List notes
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    search: Joi.string().optional(),
    folderId: Joi.string().uuid().optional(),
    noteType: Joi.string().valid('note', 'snippet', 'checklist', 'bookmark').optional(),
    tags: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ).optional(),
    isPinned: Joi.boolean().optional(),
    isFavorite: Joi.boolean().optional(),
    isArchived: Joi.boolean().optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, search, folderId, noteType, tags, isPinned, isFavorite, isArchived, sortBy, sortOrder } = req.query;
      const offset = (page - 1) * limit;

      const where = { ownerId: req.user.id };

      if (folderId) where.folderId = folderId;
      if (noteType) where.noteType = noteType;
      if (isPinned !== undefined) where.isPinned = isPinned === 'true';
      if (isFavorite !== undefined) where.isFavorite = isFavorite === 'true';
      if (isArchived !== undefined) where.isArchived = isArchived === 'true';

      // Tag filtering
      if (tags) {
        const { Op } = require('sequelize');
        const tagArray = Array.isArray(tags) ? tags : [tags];
        where.tags = { [Op.overlap]: tagArray };
      }

      // Search functionality
      if (search) {
        const { Op } = require('sequelize');
        where[Op.or] = [
          { title: { [Op.iLike]: `%${search}%` } },
          { content: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await Note.findAndCountAll({
        where,
        limit,
        offset,
        order: sortBy ? [[sortBy, sortOrder]] : [['isPinned', 'DESC'], ['updatedAt', 'DESC']],
        include: [
          {
            model: Folder,
            as: 'folder',
            attributes: ['id', 'name', 'color']
          }
        ]
      });

      res.json({
        success: true,
        notes: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list notes', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list notes'
      });
    }
  }
);

// Get note by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const note = await Note.findOne({
        where: {
          id: req.params.id,
          ownerId: req.user.id
        },
        include: [
          {
            model: Folder,
            as: 'folder',
            attributes: ['id', 'name', 'color']
          }
        ]
      });

      if (!note) {
        return res.status(404).json({
          success: false,
          error: 'Note not found'
        });
      }

      res.json({
        success: true,
        note
      });
    } catch (error) {
      logger.error('Failed to get note', { error: error.message, noteId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get note'
      });
    }
  }
);

// Search notes by content/tags
router.get('/search/query',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    query: Joi.string().min(2).required(),
    folderId: Joi.string().uuid().optional(),
    noteType: Joi.string().valid('note', 'snippet', 'checklist', 'bookmark').optional(),
    limit: Joi.number().integer().min(1).max(100).optional().default(50)
  })),
  async (req, res) => {
    try {
      const { query, folderId, noteType, limit } = req.query;
      const { Op } = require('sequelize');

      const where = {
        ownerId: req.user.id,
        isArchived: false,
        [Op.or]: [
          { title: { [Op.iLike]: `%${query}%` } },
          { content: { [Op.iLike]: `%${query}%` } },
          { tags: { [Op.contains]: [query] } }
        ]
      };

      if (folderId) where.folderId = folderId;
      if (noteType) where.noteType = noteType;

      const notes = await Note.findAll({
        where,
        limit,
        order: [['updatedAt', 'DESC']],
        include: [
          {
            model: Folder,
            as: 'folder',
            attributes: ['id', 'name', 'color']
          }
        ]
      });

      res.json({
        success: true,
        notes,
        count: notes.length
      });
    } catch (error) {
      logger.error('Failed to search notes', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to search notes'
      });
    }
  }
);

// Create note
router.post('/',
  
  requirePermission('write'),
  validateBody(noteCreateSchema),
  async (req, res) => {
    try {
      const note = await Note.create({
        ...req.body,
        ownerId: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('note:created', { note });

      logger.info('Note created', {
        noteId: note.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        note
      });
    } catch (error) {
      logger.error('Failed to create note', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create note'
      });
    }
  }
);

// Update note
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(noteUpdateSchema),
  async (req, res) => {
    try {
      const note = await Note.findOne({
        where: {
          id: req.params.id,
          ownerId: req.user.id
        }
      });

      if (!note) {
        return res.status(404).json({
          success: false,
          error: 'Note not found'
        });
      }

      await note.update(req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('note:updated', { note });

      logger.info('Note updated', {
        noteId: note.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        note
      });
    } catch (error) {
      logger.error('Failed to update note', { error: error.message, noteId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to update note'
      });
    }
  }
);

// Delete note
router.delete('/:id',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const note = await Note.findOne({
        where: {
          id: req.params.id,
          ownerId: req.user.id
        }
      });

      if (!note) {
        return res.status(404).json({
          success: false,
          error: 'Note not found'
        });
      }

      await note.destroy();

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('note:deleted', { noteId: note.id });

      logger.info('Note deleted', {
        noteId: note.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Note deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete note', { error: error.message, noteId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to delete note'
      });
    }
  }
);

// Add tags to note
router.post('/:id/tags',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    tags: Joi.array().items(Joi.string()).min(1).required()
  })),
  async (req, res) => {
    try {
      const note = await Note.findOne({
        where: {
          id: req.params.id,
          ownerId: req.user.id
        }
      });

      if (!note) {
        return res.status(404).json({
          success: false,
          error: 'Note not found'
        });
      }

      // Add new tags, avoiding duplicates
      const currentTags = note.tags || [];
      const newTags = req.body.tags.filter(tag => !currentTags.includes(tag));
      const updatedTags = [...currentTags, ...newTags];

      await note.update({ tags: updatedTags });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('note:tags-updated', { noteId: note.id, tags: updatedTags });

      logger.info('Note tags updated', {
        noteId: note.id,
        userId: req.user.id,
        tagsAdded: newTags.length
      });

      res.json({
        success: true,
        note
      });
    } catch (error) {
      logger.error('Failed to add tags to note', { error: error.message, noteId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to add tags to note'
      });
    }
  }
);

// Archive/unarchive note
router.post('/:id/archive',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    archived: Joi.boolean().required()
  })),
  async (req, res) => {
    try {
      const note = await Note.findOne({
        where: {
          id: req.params.id,
          ownerId: req.user.id
        }
      });

      if (!note) {
        return res.status(404).json({
          success: false,
          error: 'Note not found'
        });
      }

      await note.update({
        isArchived: req.body.archived,
        archivedAt: req.body.archived ? new Date() : null
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('note:archived', { noteId: note.id, archived: req.body.archived });

      logger.info('Note archive status changed', {
        noteId: note.id,
        userId: req.user.id,
        archived: req.body.archived
      });

      res.json({
        success: true,
        note
      });
    } catch (error) {
      logger.error('Failed to change archive status', { error: error.message, noteId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to change archive status'
      });
    }
  }
);

module.exports = router;
