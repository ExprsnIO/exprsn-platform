const express = require('express');
const router = express.Router();
const { requirePermission } = require('../../../middleware/auth');
const { validateQuery } = require('../../../middleware/validation');
const Joi = require('joi');
const searchService = require('../../../services/forge/groupware/searchService');
const logger = require('../../../utils/logger');

// Validation schemas
const globalSearchSchema = Joi.object({
  q: Joi.string().min(2).max(200).required(),
  modules: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string().valid('documents', 'wiki', 'tasks', 'notes', 'calendar', 'boards', 'knowledge', 'forums'))
  ).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  // Optional filters
  folderId: Joi.string().uuid().optional(),
  status: Joi.string().optional(),
  priority: Joi.string().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional()
});

const suggestionsSchema = Joi.object({
  q: Joi.string().min(1).max(100).required(),
  module: Joi.string().valid('documents', 'wiki', 'tasks', 'notes').required(),
  limit: Joi.number().integer().min(1).max(10).default(5)
});

// Global search endpoint
router.get('/',
  
  requirePermission('read'),
  validateQuery(globalSearchSchema),
  async (req, res) => {
    try {
      const { q, modules, page, limit, ...filters } = req.query;
      const offset = (page - 1) * limit;

      // Parse modules if provided as string
      let moduleList;
      if (modules) {
        moduleList = typeof modules === 'string' ? modules.split(',') : modules;
      }

      const results = await searchService.globalSearch({
        query: q,
        modules: moduleList,
        userId: req.user.id,
        limit,
        offset,
        filters
      });

      logger.info('Global search performed', {
        query: q,
        modules: moduleList,
        totalResults: results.total,
        userId: req.user.id
      });

      res.json({
        success: true,
        query: q,
        results: results.results,
        total: results.total,
        byModule: results.byModule,
        pagination: {
          page,
          limit,
          pages: Math.ceil(results.total / limit)
        }
      });
    } catch (error) {
      logger.error('Search failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Search suggestions (autocomplete)
router.get('/suggestions',
  
  requirePermission('read'),
  validateQuery(suggestionsSchema),
  async (req, res) => {
    try {
      const { q, module, limit } = req.query;

      const suggestions = await searchService.getSearchSuggestions(q, module, limit);

      res.json({
        success: true,
        query: q,
        module,
        suggestions
      });
    } catch (error) {
      logger.error('Failed to get search suggestions', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get search suggestions'
      });
    }
  }
);

// Search documents only
router.get('/documents',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    q: Joi.string().min(2).max(200).required(),
    folderId: Joi.string().uuid().optional()
  })),
  async (req, res) => {
    try {
      const { q, folderId } = req.query;

      const results = await searchService.searchDocuments(q, req.user.id, { folderId });

      res.json({
        success: true,
        query: q,
        ...results
      });
    } catch (error) {
      logger.error('Document search failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Document search failed'
      });
    }
  }
);

// Search wiki pages only
router.get('/wiki',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    q: Joi.string().min(2).max(200).required(),
    status: Joi.string().valid('draft', 'published', 'archived').optional()
  })),
  async (req, res) => {
    try {
      const { q, status } = req.query;

      const results = await searchService.searchWikiPages(q, req.user.id, { status });

      res.json({
        success: true,
        query: q,
        ...results
      });
    } catch (error) {
      logger.error('Wiki search failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Wiki search failed'
      });
    }
  }
);

// Search tasks only
router.get('/tasks',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    q: Joi.string().min(2).max(200).required(),
    status: Joi.string().optional(),
    priority: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const { q, status, priority } = req.query;

      const results = await searchService.searchTasks(q, req.user.id, { status, priority });

      res.json({
        success: true,
        query: q,
        ...results
      });
    } catch (error) {
      logger.error('Task search failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Task search failed'
      });
    }
  }
);

// Search notes only
router.get('/notes',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    q: Joi.string().min(2).max(200).required()
  })),
  async (req, res) => {
    try {
      const { q } = req.query;

      const results = await searchService.searchNotes(q, req.user.id);

      res.json({
        success: true,
        query: q,
        ...results
      });
    } catch (error) {
      logger.error('Note search failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Note search failed'
      });
    }
  }
);

// Search calendar events only
router.get('/calendar',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    q: Joi.string().min(2).max(200).required(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
  })),
  async (req, res) => {
    try {
      const { q, startDate, endDate } = req.query;

      const results = await searchService.searchCalendarEvents(q, req.user.id, { startDate, endDate });

      res.json({
        success: true,
        query: q,
        ...results
      });
    } catch (error) {
      logger.error('Calendar search failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Calendar search failed'
      });
    }
  }
);

// Search board cards only
router.get('/boards',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    q: Joi.string().min(2).max(200).required()
  })),
  async (req, res) => {
    try {
      const { q } = req.query;

      const results = await searchService.searchBoardCards(q, req.user.id);

      res.json({
        success: true,
        query: q,
        ...results
      });
    } catch (error) {
      logger.error('Board search failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Board search failed'
      });
    }
  }
);

// Search knowledge articles only
router.get('/knowledge',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    q: Joi.string().min(2).max(200).required()
  })),
  async (req, res) => {
    try {
      const { q } = req.query;

      const results = await searchService.searchKnowledgeArticles(q, req.user.id);

      res.json({
        success: true,
        query: q,
        ...results
      });
    } catch (error) {
      logger.error('Knowledge search failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Knowledge search failed'
      });
    }
  }
);

// Search forum threads only
router.get('/forums',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    q: Joi.string().min(2).max(200).required()
  })),
  async (req, res) => {
    try {
      const { q } = req.query;

      const results = await searchService.searchForumThreads(q, req.user.id);

      res.json({
        success: true,
        query: q,
        ...results
      });
    } catch (error) {
      logger.error('Forum search failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Forum search failed'
      });
    }
  }
);

module.exports = router;
