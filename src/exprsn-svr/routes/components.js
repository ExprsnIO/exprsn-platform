/**
 * ═══════════════════════════════════════════════════════════
 * Component Routes
 * API endpoints for component library management
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const componentService = require('../services/componentService');
const { requireAuth } = require('../middleware/auth');

/**
 * @route   GET /api/components
 * @desc    List all components with optional filters
 * @access  Public
 */
router.get('/', async (req, res, next) => {
  try {
    const filters = {
      category: req.query.category,
      isPublic: req.query.isPublic === 'true' ? true : req.query.isPublic === 'false' ? false : undefined,
      createdBy: req.query.createdBy,
      tags: req.query.tags ? req.query.tags.split(',') : undefined,
      orderBy: req.query.orderBy || 'uses_count',
      orderDirection: req.query.orderDirection || 'DESC',
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0
    };

    const components = await componentService.listComponents(filters);

    res.json({
      success: true,
      count: components.length,
      data: components
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/components/popular
 * @desc    Get popular components
 * @access  Public
 */
router.get('/popular', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const components = await componentService.getPopularComponents(limit);

    res.json({
      success: true,
      count: components.length,
      data: components
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/components/category/:category
 * @desc    Get components by category
 * @access  Public
 */
router.get('/category/:category', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const components = await componentService.getComponentsByCategory(
      req.params.category,
      limit
    );

    res.json({
      success: true,
      count: components.length,
      data: components
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/components/search
 * @desc    Search components by keyword
 * @access  Public
 */
router.get('/search', async (req, res, next) => {
  try {
    const keyword = req.query.q || req.query.keyword;
    if (!keyword) {
      return res.status(400).json({
        success: false,
        error: 'Search keyword is required'
      });
    }

    const filters = {
      category: req.query.category,
      isPublic: req.query.isPublic === 'true' ? true : undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0
    };

    const components = await componentService.searchComponents(keyword, filters);

    res.json({
      success: true,
      count: components.length,
      data: components
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/components/:id
 * @desc    Get component by ID or slug
 * @access  Public (with access control for private components)
 */
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const component = await componentService.getComponent(req.params.id, userId);

    res.json({
      success: true,
      data: component
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/components/:id/with-dependencies
 * @desc    Get component with all its dependencies
 * @access  Public (with access control for private components)
 */
router.get('/:id/with-dependencies', async (req, res, next) => {
  try {
    const result = await componentService.getComponentWithDependencies(req.params.id);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/components
 * @desc    Create a new component
 * @access  Private
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const component = await componentService.createComponent(req.body, req.user.id);

    res.status(201).json({
      success: true,
      message: 'Component created successfully',
      data: component
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/components/:id
 * @desc    Update component
 * @access  Private (owner only)
 */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const component = await componentService.updateComponent(
      req.params.id,
      req.body,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Component updated successfully',
      data: component
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/components/:id
 * @desc    Delete component
 * @access  Private (owner only)
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await componentService.deleteComponent(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Component deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/components/:id/render
 * @desc    Render component with props
 * @access  Public
 */
router.post('/:id/render', async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const component = await componentService.getComponent(req.params.id, userId);
    const rendered = componentService.renderComponent(component, req.body.props || {});

    // Increment usage count
    await componentService.incrementUsage(component.id);

    res.json({
      success: true,
      data: rendered
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
