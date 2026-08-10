const express = require('express');
const router = express.Router();
const templateService = require('../services/templateService');
const auth = require('../middleware/auth');
const { param, body, query, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

/**
 * GET /api/templates
 * Get all workflow templates
 */
router.get('/',
  [
    query('category').optional().isString(),
    query('tags').optional().isString(),
    query('search').optional().isString()
  ],
  validate,
  async (req, res) => {
    try {
      const { category, tags, search } = req.query;

      const options = {
        category,
        tags: tags ? tags.split(',') : undefined,
        search
      };

      const templates = await templateService.getAllTemplates(options);

      res.json({
        success: true,
        data: templates,
        count: templates.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * GET /api/templates/categories
 * Get template categories with counts
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await templateService.getCategories();

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/templates/:id
 * Get template by ID
 */
router.get('/:id',
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      const template = await templateService.getTemplateById(req.params.id);

      res.json({
        success: true,
        data: template
      });
    } catch (error) {
      res.status(error.message === 'Template not found' ? 404 : 500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * POST /api/templates/:id/instantiate
 * Create workflow from template
 */
router.post('/:id/instantiate',
  auth.validateToken,
  [
    param('id').isUUID(),
    body('name').optional().isString().trim().isLength({ min: 1, max: 255 }),
    body('description').optional().isString(),
    body('category').optional().isString(),
    body('tags').optional().isArray(),
    body('trigger_type').optional().isIn(['manual', 'scheduled', 'webhook', 'event', 'api']),
    body('trigger_config').optional().isObject()
  ],
  validate,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const customizations = req.body;

      const workflow = await templateService.instantiateTemplate(id, userId, customizations);

      res.status(201).json({
        success: true,
        message: 'Workflow created from template',
        data: workflow
      });
    } catch (error) {
      res.status(error.message === 'Template not found' ? 404 : 500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * POST /api/templates/from-workflow/:workflowId
 * Create template from existing workflow
 */
router.post('/from-workflow/:workflowId',
  auth.validateToken,
  [
    param('workflowId').isUUID(),
    body('name').isString().trim().isLength({ min: 1, max: 255 }),
    body('description').optional().isString(),
    body('category').optional().isString().default('Custom')
  ],
  validate,
  async (req, res) => {
    try {
      const { workflowId } = req.params;
      const userId = req.user.id;
      const templateData = req.body;

      const template = await templateService.createTemplate(workflowId, userId, templateData);

      res.status(201).json({
        success: true,
        message: 'Template created from workflow',
        data: template
      });
    } catch (error) {
      res.status(error.message.includes('not found') || error.message.includes('unauthorized') ? 404 : 500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * POST /api/templates/initialize-builtin
 * Initialize built-in templates (admin only)
 */
router.post('/initialize-builtin',
  auth.validateToken,
  async (req, res) => {
    try {
      const userId = req.user.id;

      const result = await templateService.initializeBuiltInTemplates(userId);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
