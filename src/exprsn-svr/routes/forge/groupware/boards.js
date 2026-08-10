const express = require('express');
const router = express.Router();
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const boardService = require('../../../services/forge/groupware/boardService');
const logger = require('../../../utils/logger');

// Validation schemas
const boardCreateSchema = Joi.object({
  name: Joi.string().max(255).required(),
  description: Joi.string().optional(),
  boardType: Joi.string().valid('kanban', 'scrum', 'support', 'custom').optional(),
  visibility: Joi.string().valid('private', 'team', 'organization', 'public').optional(),
  projectId: Joi.string().uuid().optional(),
  teamId: Joi.string().uuid().optional(),
  settings: Joi.object().optional(),
  backgroundColor: Joi.string().max(7).optional(),
  backgroundImage: Joi.string().uri().optional(),
  tags: Joi.array().items(Joi.string()).optional()
});

const boardUpdateSchema = boardCreateSchema.fork(['name'], (schema) => schema.optional());

const columnCreateSchema = Joi.object({
  name: Joi.string().max(255).required(),
  description: Joi.string().optional(),
  position: Joi.number().integer().min(0).optional(),
  color: Joi.string().max(7).optional(),
  taskStatus: Joi.string().valid('pending', 'in_progress', 'completed', 'cancelled').optional(),
  wipLimit: Joi.number().integer().min(1).optional(),
  isCompleteColumn: Joi.boolean().optional(),
  isDefaultColumn: Joi.boolean().optional()
});

const columnUpdateSchema = columnCreateSchema.fork(['name'], (schema) => schema.optional());

const columnMoveSchema = Joi.object({
  position: Joi.number().integer().min(0).required()
});

const cardAddSchema = Joi.object({
  taskId: Joi.string().uuid().required(),
  columnId: Joi.string().uuid().optional(),
  position: Joi.number().integer().min(0).optional(),
  coverImage: Joi.string().uri().optional(),
  coverColor: Joi.string().max(7).optional(),
  labels: Joi.array().items(Joi.string()).optional()
});

const cardMoveSchema = Joi.object({
  columnId: Joi.string().uuid().required(),
  position: Joi.number().integer().min(0).required(),
  swimlaneId: Joi.string().uuid().optional().allow(null)
});

const cardUpdateSchema = Joi.object({
  coverImage: Joi.string().uri().optional().allow(null),
  coverColor: Joi.string().max(7).optional().allow(null),
  labels: Joi.array().items(Joi.string()).optional(),
  isBlocked: Joi.boolean().optional(),
  blockReason: Joi.string().optional().allow(null),
  customFields: Joi.object().optional()
});

// ===== Board Routes =====

// List boards
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    projectId: Joi.string().uuid().optional(),
    teamId: Joi.string().uuid().optional(),
    boardType: Joi.string().valid('kanban', 'scrum', 'support', 'custom').optional(),
    status: Joi.string().valid('active', 'archived', 'template').optional(),
    visibility: Joi.string().valid('private', 'team', 'organization', 'public').optional(),
    search: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, projectId, teamId, boardType, status, visibility, search } = req.query;
      const offset = (page - 1) * limit;

      const result = await boardService.listBoards({
        ownerId: req.user.id,
        projectId,
        teamId,
        boardType,
        status,
        visibility,
        search,
        limit,
        offset
      });

      res.json({
        success: true,
        boards: result.boards,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list boards', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list boards'
      });
    }
  }
);

// Create board
router.post('/',
  
  requirePermission('write'),
  validateBody(boardCreateSchema),
  async (req, res) => {
    try {
      const board = await boardService.createBoard({
        ...req.body,
        ownerId: req.user.id
      });

      res.status(201).json({
        success: true,
        board
      });
    } catch (error) {
      logger.error('Failed to create board', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create board'
      });
    }
  }
);

// Get board by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const board = await boardService.getBoardById(req.params.id);

      res.json({
        success: true,
        board
      });
    } catch (error) {
      logger.error('Failed to get board', { error: error.message, boardId: req.params.id });
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update board
router.put('/:id',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(boardUpdateSchema),
  async (req, res) => {
    try {
      const board = await boardService.updateBoard(req.params.id, req.body);

      res.json({
        success: true,
        board
      });
    } catch (error) {
      logger.error('Failed to update board', { error: error.message, boardId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to update board'
      });
    }
  }
);

// Delete board (archive)
router.delete('/:id',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const result = await boardService.deleteBoard(req.params.id, req.user.id);

      res.json(result);
    } catch (error) {
      logger.error('Failed to delete board', { error: error.message, boardId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to delete board'
      });
    }
  }
);

// Get board statistics
router.get('/:id/stats',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const stats = await boardService.getBoardStatistics(req.params.id);

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error('Failed to get board statistics', { error: error.message, boardId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get board statistics'
      });
    }
  }
);

// ===== Column Routes =====

// Create column
router.post('/:boardId/columns',
  
  requirePermission('write'),
  validateParams(Joi.object({ boardId: Joi.string().uuid().required() })),
  validateBody(columnCreateSchema),
  async (req, res) => {
    try {
      const column = await boardService.createColumn({
        boardId: req.params.boardId,
        ...req.body
      });

      res.status(201).json({
        success: true,
        column
      });
    } catch (error) {
      logger.error('Failed to create column', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create column'
      });
    }
  }
);

// Update column
router.put('/:boardId/columns/:columnId',
  
  requirePermission('write'),
  validateParams(Joi.object({
    boardId: Joi.string().uuid().required(),
    columnId: Joi.string().uuid().required()
  })),
  validateBody(columnUpdateSchema),
  async (req, res) => {
    try {
      const column = await boardService.updateColumn(req.params.columnId, req.body);

      res.json({
        success: true,
        column
      });
    } catch (error) {
      logger.error('Failed to update column', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to update column'
      });
    }
  }
);

// Move column
router.post('/:boardId/columns/:columnId/move',
  
  requirePermission('write'),
  validateParams(Joi.object({
    boardId: Joi.string().uuid().required(),
    columnId: Joi.string().uuid().required()
  })),
  validateBody(columnMoveSchema),
  async (req, res) => {
    try {
      const board = await boardService.moveColumn(req.params.columnId, req.body.position);

      res.json({
        success: true,
        board
      });
    } catch (error) {
      logger.error('Failed to move column', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to move column'
      });
    }
  }
);

// Delete column
router.delete('/:boardId/columns/:columnId',
  
  requirePermission('delete'),
  validateParams(Joi.object({
    boardId: Joi.string().uuid().required(),
    columnId: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      const result = await boardService.deleteColumn(req.params.columnId);

      res.json(result);
    } catch (error) {
      logger.error('Failed to delete column', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ===== Card Routes =====

// Add card to board
router.post('/:boardId/cards',
  
  requirePermission('write'),
  validateParams(Joi.object({ boardId: Joi.string().uuid().required() })),
  validateBody(cardAddSchema),
  async (req, res) => {
    try {
      const card = await boardService.addCard({
        boardId: req.params.boardId,
        addedById: req.user.id,
        ...req.body
      });

      // Emit Socket.IO event for real-time update
      const io = req.app.get('io');
      io.to(`board:${req.params.boardId}`).emit('card:added', card);

      res.status(201).json({
        success: true,
        card
      });
    } catch (error) {
      logger.error('Failed to add card', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Move card
router.post('/:boardId/cards/:cardId/move',
  
  requirePermission('write'),
  validateParams(Joi.object({
    boardId: Joi.string().uuid().required(),
    cardId: Joi.string().uuid().required()
  })),
  validateBody(cardMoveSchema),
  async (req, res) => {
    try {
      const card = await boardService.moveCard(req.params.cardId, req.body);

      // Emit Socket.IO event for real-time update
      const io = req.app.get('io');
      io.to(`board:${req.params.boardId}`).emit('card:moved', card);

      res.json({
        success: true,
        card
      });
    } catch (error) {
      logger.error('Failed to move card', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update card
router.put('/:boardId/cards/:cardId',
  
  requirePermission('write'),
  validateParams(Joi.object({
    boardId: Joi.string().uuid().required(),
    cardId: Joi.string().uuid().required()
  })),
  validateBody(cardUpdateSchema),
  async (req, res) => {
    try {
      const card = await boardService.updateCard(req.params.cardId, req.body);

      // Emit Socket.IO event for real-time update
      const io = req.app.get('io');
      io.to(`board:${req.params.boardId}`).emit('card:updated', card);

      res.json({
        success: true,
        card
      });
    } catch (error) {
      logger.error('Failed to update card', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to update card'
      });
    }
  }
);

// Remove card from board
router.delete('/:boardId/cards/:cardId',
  
  requirePermission('delete'),
  validateParams(Joi.object({
    boardId: Joi.string().uuid().required(),
    cardId: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      const result = await boardService.removeCard(req.params.cardId);

      // Emit Socket.IO event for real-time update
      const io = req.app.get('io');
      io.to(`board:${req.params.boardId}`).emit('card:removed', { cardId: req.params.cardId });

      res.json(result);
    } catch (error) {
      logger.error('Failed to remove card', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to remove card'
      });
    }
  }
);

module.exports = router;
