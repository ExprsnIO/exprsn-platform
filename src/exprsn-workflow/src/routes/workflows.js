const express = require('express');
const router = express.Router();
const workflowController = require('../controllers/workflowController');
const workflowTemplateService = require('../services/workflowTemplateService');
const { validateToken, checkWorkflowPermission } = require('../middleware/auth');
const { validate, validateQuery, createWorkflowSchema, updateWorkflowSchema, listWorkflowsQuerySchema } = require('../middleware/validation');

/**
 * @route   POST /api/workflows
 * @desc    Create new workflow
 * @access  Private
 */
router.post('/',
  validateToken,
  validate(createWorkflowSchema),
  workflowController.createWorkflow
);

/**
 * @route   GET /api/workflows
 * @desc    List workflows
 * @access  Private
 */
router.get('/',
  validateToken,
  validateQuery(listWorkflowsQuerySchema),
  workflowController.listWorkflows
);

/**
 * @route   GET /api/workflows/:id
 * @desc    Get workflow by ID
 * @access  Private
 */
router.get('/:id',
  validateToken,
  checkWorkflowPermission('view'),
  workflowController.getWorkflow
);

/**
 * @route   PUT /api/workflows/:id
 * @desc    Update workflow
 * @access  Private
 */
router.put('/:id',
  validateToken,
  checkWorkflowPermission('edit'),
  validate(updateWorkflowSchema),
  workflowController.updateWorkflow
);

/**
 * @route   DELETE /api/workflows/:id
 * @desc    Delete workflow
 * @access  Private
 */
router.delete('/:id',
  validateToken,
  checkWorkflowPermission('delete'),
  workflowController.deleteWorkflow
);

/**
 * @route   POST /api/workflows/:id/clone
 * @desc    Clone workflow
 * @access  Private
 */
router.post('/:id/clone',
  validateToken,
  checkWorkflowPermission('view'),
  workflowController.cloneWorkflow
);

/**
 * @route   GET /api/workflows/:id/stats
 * @desc    Get workflow statistics
 * @access  Private
 */
router.get('/:id/stats',
  validateToken,
  checkWorkflowPermission('view'),
  workflowController.getWorkflowStats
);

// ===== Workflow Template Routes =====

/**
 * @route   GET /api/workflows/templates/all
 * @desc    Get all workflow templates
 * @access  Private
 */
router.get('/templates/all',
  validateToken,
  async (req, res) => {
    try {
      const { category, difficulty, search } = req.query;

      const templates = workflowTemplateService.getAllTemplates({
        category,
        difficulty,
        search
      });

      res.json({
        success: true,
        data: templates
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  }
);

/**
 * @route   GET /api/workflows/templates/categories
 * @desc    Get template categories
 * @access  Private
 */
router.get('/templates/categories',
  validateToken,
  async (req, res) => {
    try {
      const categories = workflowTemplateService.getCategories();

      res.json({
        success: true,
        data: categories
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  }
);

/**
 * @route   GET /api/workflows/templates/:templateId
 * @desc    Get template by ID
 * @access  Private
 */
router.get('/templates/:templateId',
  validateToken,
  async (req, res) => {
    try {
      const template = workflowTemplateService.getTemplate(req.params.templateId);

      res.json({
        success: true,
        data: template
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: error.message
      });
    }
  }
);

/**
 * @route   POST /api/workflows/templates/:templateId/create
 * @desc    Create workflow from template
 * @access  Private
 */
router.post('/templates/:templateId/create',
  validateToken,
  async (req, res) => {
    try {
      const { name, description, config, variables } = req.body;

      const workflow = await workflowTemplateService.createFromTemplate(
        req.params.templateId,
        req.user.id,
        { name, description, config, variables }
      );

      res.status(201).json({
        success: true,
        data: workflow
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'CREATION_FAILED',
        message: error.message
      });
    }
  }
);

/**
 * @route   GET /api/workflows/templates/category/:category
 * @desc    Get templates by category
 * @access  Private
 */
router.get('/templates/category/:category',
  validateToken,
  async (req, res) => {
    try {
      const templates = workflowTemplateService.getTemplatesByCategory(req.params.category);

      res.json({
        success: true,
        data: templates
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  }
);

/**
 * @route   GET /api/workflows/templates/search/:query
 * @desc    Search templates
 * @access  Private
 */
router.get('/templates/search/:query',
  validateToken,
  async (req, res) => {
    try {
      const templates = workflowTemplateService.searchTemplates(req.params.query);

      res.json({
        success: true,
        data: templates
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  }
);

module.exports = router;
