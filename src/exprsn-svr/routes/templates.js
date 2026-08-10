/**
 * ═══════════════════════════════════════════════════════════
 * Template Routes
 * API endpoints for template library management
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const templateService = require('../services/templateService');
const { requireAuth } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

/**
 * @route   GET /api/templates
 * @desc    List all templates with optional filters
 * @access  Public
 */
router.get('/', async (req, res, next) => {
  try {
    const filters = {
      category: req.query.category,
      isPublic: req.query.isPublic === 'true' ? true : req.query.isPublic === 'false' ? false : undefined,
      isFeatured: req.query.isFeatured === 'true' ? true : undefined,
      createdBy: req.query.createdBy,
      tags: req.query.tags ? req.query.tags.split(',') : undefined,
      orderBy: req.query.orderBy || 'uses_count',
      orderDirection: req.query.orderDirection || 'DESC',
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0
    };

    const templates = await templateService.listTemplates(filters);

    res.json({
      success: true,
      count: templates.length,
      data: templates
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/templates/featured
 * @desc    Get featured templates
 * @access  Public
 */
router.get('/featured', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const templates = await templateService.getFeaturedTemplates(limit);

    res.json({
      success: true,
      count: templates.length,
      data: templates
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/templates/popular
 * @desc    Get popular templates
 * @access  Public
 */
router.get('/popular', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const templates = await templateService.getPopularTemplates(limit);

    res.json({
      success: true,
      count: templates.length,
      data: templates
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/templates/:id
 * @desc    Get template by ID or slug
 * @access  Public (with access control for private templates)
 */
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const template = await templateService.getTemplate(req.params.id, userId);

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/templates
 * @desc    Create a new template
 * @access  Private
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const template = await templateService.createTemplate(req.body, req.user.id);

    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      data: template
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/templates/:id
 * @desc    Update template
 * @access  Private (owner only)
 */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const template = await templateService.updateTemplate(
      req.params.id,
      req.body,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Template updated successfully',
      data: template
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/templates/:id
 * @desc    Delete template
 * @access  Private (owner only)
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await templateService.deleteTemplate(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/templates/:id/rate
 * @desc    Rate a template
 * @access  Private
 */
router.post('/:id/rate', requireAuth, async (req, res, next) => {
  try {
    const { rating } = req.body;

    if (!rating || rating < 0 || rating > 5) {
      throw new AppError('Rating must be between 0 and 5', 400);
    }

    const template = await templateService.rateTemplate(
      req.params.id,
      parseFloat(rating),
      req.user.id
    );

    res.json({
      success: true,
      message: 'Template rated successfully',
      data: {
        rating: template.rating,
        ratingCount: template.rating_count
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/templates/:id/create-page
 * @desc    Create a page from template
 * @access  Private
 */
router.post('/:id/create-page', requireAuth, async (req, res, next) => {
  try {
    const page = await templateService.createPageFromTemplate(
      req.params.id,
      req.body,
      req.user.id
    );

    res.status(201).json({
      success: true,
      message: 'Page created from template successfully',
      data: page
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
