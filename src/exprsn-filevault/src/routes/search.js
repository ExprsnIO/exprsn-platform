/**
 * ═══════════════════════════════════════════════════════════════════════
 * Search Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const fileService = require('../services/fileService');
const {
  authenticate,
  asyncHandler
} = require('../middleware');

/**
 * Search files
 * GET /api/search?q=query
 */
router.get('/',
  authenticate,
  asyncHandler(async (req, res) => {
    const query = req.query.q;

    if (!query) {
      return res.status(400).json({
        error: 'MISSING_QUERY',
        message: 'Search query parameter (q) is required'
      });
    }

    const files = await fileService.searchFiles(req.userId, query, {
      limit: parseInt(req.query.limit || '50'),
      offset: parseInt(req.query.offset || '0')
    });

    res.json({
      success: true,
      query,
      files,
      count: files.length
    });
  })
);

/**
 * Get files by tag
 * GET /api/files/tag/:tag
 */
router.get('/tag/:tag',
  authenticate,
  asyncHandler(async (req, res) => {
    const files = await fileService.listFiles(req.userId, null, {
      tags: [req.params.tag],
      limit: parseInt(req.query.limit || '50'),
      offset: parseInt(req.query.offset || '0')
    });

    res.json({
      success: true,
      tag: req.params.tag,
      files,
      count: files.length
    });
  })
);

module.exports = router;
