/**
 * ═══════════════════════════════════════════════════════════
 * Editor Routes
 * Code editor interface for creating/editing pages
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const pageService = require('../services/pageService');
const { requireCAToken } = require('../middleware/caAuth');
const { detectSQLInjection } = require('../middleware/sqlInjection');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// All editor routes require authentication
router.use(detectSQLInjection);
router.use(requireCAToken({ requiredPermissions: { write: true } }));

/**
 * GET / - Editor homepage (list user's pages)
 */
router.get('/', asyncHandler(async (req, res) => {
  const pages = await pageService.listPages({
    ownerId: req.user.id,
    limit: 100
  }, req.user.id);

  res.render('editor/index', {
    pages,
    user: req.user
  });
}));

/**
 * GET /new - Create new page
 */
router.get('/new', (req, res) => {
  res.render('editor/edit', {
    page: null,
    user: req.user,
    mode: 'create'
  });
});

/**
 * GET /edit/:id - Edit existing page
 */
router.get('/edit/:id', asyncHandler(async (req, res) => {
  const page = await pageService.getPage(req.params.id, req.user.id);

  if (!page.canAccess(req.user.id, 'write')) {
    return res.status(403).render('error', {
      message: 'You do not have permission to edit this page'
    });
  }

  res.render('editor/edit', {
    page,
    user: req.user,
    mode: 'edit'
  });
}));

/**
 * GET /designer - Visual designer homepage
 */
router.get('/designer', (req, res) => {
  res.sendFile(require('path').join(__dirname, '../public/designer.html'));
});

/**
 * GET /designer/new - Create new page in visual designer
 */
router.get('/designer/new', (req, res) => {
  res.sendFile(require('path').join(__dirname, '../public/designer.html'));
});

/**
 * GET /designer/edit/:id - Edit page in visual designer
 */
router.get('/designer/edit/:id', asyncHandler(async (req, res) => {
  // Verify user has access to the page
  const page = await pageService.getPage(req.params.id, req.user.id);

  if (!page.canAccess(req.user.id, 'write')) {
    return res.status(403).render('error', {
      message: 'You do not have permission to edit this page'
    });
  }

  res.sendFile(require('path').join(__dirname, '../public/designer.html'));
}));

module.exports = router;
