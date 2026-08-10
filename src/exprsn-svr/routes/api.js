/**
 * ═══════════════════════════════════════════════════════════
 * API Routes
 * RESTful API for page management
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const pageService = require('../services/pageService');
const codeExecutionService = require('../services/codeExecutionService');
const { requireCAToken, optionalCAToken } = require('../middleware/caAuth');
const { detectSQLInjection } = require('../middleware/sqlInjection');
const { asyncHandler } = require('../middleware/errorHandler');
const { codeExecutionLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

// Apply SQL injection detection to all API routes
router.use(detectSQLInjection);

/**
 * GET /pages - List pages
 */
router.get('/pages', optionalCAToken(), asyncHandler(async (req, res) => {
  const filters = {
    status: req.query.status,
    isPublic: req.query.isPublic === 'true',
    ownerId: req.query.ownerId,
    limit: parseInt(req.query.limit) || 50,
    offset: parseInt(req.query.offset) || 0
  };

  const pages = await pageService.listPages(filters, req.user?.id);

  res.json({
    success: true,
    data: {
      pages: pages.map(p => p.toSafeJSON()),
      count: pages.length
    }
  });
}));

/**
 * POST /pages - Create new page
 */
router.post('/pages', requireCAToken({ requiredPermissions: { write: true } }), asyncHandler(async (req, res) => {
  const page = await pageService.createPage(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: { page: page.toSafeJSON() }
  });
}));

/**
 * GET /pages/:id - Get page details
 */
router.get('/pages/:id', optionalCAToken(), asyncHandler(async (req, res) => {
  const page = await pageService.getPage(req.params.id, req.user?.id);

  res.json({
    success: true,
    data: { page: page.toSafeJSON() }
  });
}));

/**
 * PUT /pages/:id - Update page
 */
router.put('/pages/:id', requireCAToken({ requiredPermissions: { write: true } }), asyncHandler(async (req, res) => {
  const page = await pageService.updatePage(req.params.id, req.body, req.user.id);

  res.json({
    success: true,
    data: { page: page.toSafeJSON() }
  });
}));

/**
 * DELETE /pages/:id - Delete page
 */
router.delete('/pages/:id', requireCAToken({ requiredPermissions: { delete: true } }), asyncHandler(async (req, res) => {
  await pageService.deletePage(req.params.id, req.user.id);

  res.json({
    success: true,
    message: 'Page deleted successfully'
  });
}));

/**
 * POST /pages/:id/publish - Publish page
 */
router.post('/pages/:id/publish', requireCAToken({ requiredPermissions: { write: true } }), asyncHandler(async (req, res) => {
  const page = await pageService.publishPage(req.params.id, req.user.id);

  res.json({
    success: true,
    data: { page: page.toSafeJSON() }
  });
}));

/**
 * POST /code/validate - Validate JavaScript syntax
 */
router.post('/code/validate', requireCAToken({ requiredPermissions: { read: true } }), asyncHandler(async (req, res) => {
  const { code } = req.body;
  const result = codeExecutionService.validateSyntax(code);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /code/execute - Execute JavaScript code (for testing)
 */
router.post('/code/execute', 
  requireCAToken({ requiredPermissions: { write: true } }),
  codeExecutionLimiter,
  asyncHandler(async (req, res) => {
    const { code, context } = req.body;

    logger.info('Code execution requested', {
      userId: req.user.id,
      codeLength: code?.length
    });

    const result = await codeExecutionService.executeCode(code, context || {});

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * GET /pages/:id/versions - Get version history for a page
 */
router.get(
  '/pages/:id/versions',
  requireCAToken(),
  asyncHandler(async (req, res) => {
    const versions = await pageService.getVersionHistory(
      req.params.id,
      req.user.id,
      {
        includeAutoSaves: req.query.includeAutoSaves === 'true',
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      }
    );

    res.json({
      success: true,
      data: versions
    });
  })
);

/**
 * GET /pages/:id/versions/:versionId - Get a specific version
 */
router.get(
  '/pages/:id/versions/:versionId',
  requireCAToken(),
  asyncHandler(async (req, res) => {
    const version = await pageService.getVersion(req.params.versionId, req.user.id);

    res.json({
      success: true,
      data: version
    });
  })
);

/**
 * POST /pages/:id/versions - Create a new version snapshot
 */
router.post(
  '/pages/:id/versions',
  requireCAToken(),
  asyncHandler(async (req, res) => {
    const version = await pageService.createVersion(
      req.params.id,
      req.user.id,
      req.body.changeSummary,
      req.body.isAutoSave || false
    );

    res.status(201).json({
      success: true,
      message: 'Version created successfully',
      data: version.toSummaryJSON()
    });
  })
);

/**
 * GET /pages/versions/compare - Compare two versions
 */
router.get(
  '/pages/versions/compare',
  requireCAToken(),
  asyncHandler(async (req, res) => {
    const { version1, version2 } = req.query;

    if (!version1 || !version2) {
      return res.status(400).json({
        success: false,
        error: 'Both version1 and version2 parameters are required'
      });
    }

    const diff = await pageService.compareVersions(version1, version2, req.user.id);

    res.json({
      success: true,
      data: diff
    });
  })
);

/**
 * POST /pages/:id/versions/:versionId/restore - Restore page from a version
 */
router.post(
  '/pages/:id/versions/:versionId/restore',
  requireCAToken(),
  asyncHandler(async (req, res) => {
    const page = await pageService.restoreVersion(req.params.versionId, req.user.id);

    res.json({
      success: true,
      message: 'Page restored successfully',
      data: page.toSafeJSON()
    });
  })
);

/**
 * GET /health - Health check
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString()
    }
  });
});

module.exports = router;
