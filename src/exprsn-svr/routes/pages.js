/**
 * ═══════════════════════════════════════════════════════════
 * Page Routes
 * Serving static and dynamic HTML pages
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const pageService = require('../services/pageService');
const codeExecutionService = require('../services/codeExecutionService');
const { optionalCAToken } = require('../middleware/caAuth');
const { detectSQLInjection } = require('../middleware/sqlInjection');
const { asyncHandler } = require('../middleware/errorHandler');
const { pageViewLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

// Apply middleware
router.use(detectSQLInjection);
router.use(pageViewLimiter);
router.use(optionalCAToken());

/**
 * GET /:slug - View a page
 */
router.get('/:slug', asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const userId = req.user?.id;

  // Get page
  const page = await pageService.getPage(slug, userId);

  // Increment view count
  await pageService.incrementViews(page.id);

  // If static page, serve HTML directly
  if (page.is_static) {
    logger.info('Serving static page', {
      pageId: page.id,
      slug: page.slug,
      userId
    });

    res.send(renderStaticPage(page));
    return;
  }

  // If dynamic page, execute server code and render with EJS
  const requestContext = {
    query: req.query,
    params: req.params,
    user: req.user
  };

  const serverData = await codeExecutionService.executePageCode(page, requestContext);

  logger.info('Serving dynamic page', {
    pageId: page.id,
    slug: page.slug,
    userId
  });

  res.render('page-viewer', {
    page,
    serverData,
    user: req.user
  });
}));

/**
 * Render static page with all content
 */
function renderStaticPage(page) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(page.title)}</title>
  ${page.description ? '<meta name="description" content="' + escapeHtml(page.description) + '">' : ''}
  
  <!-- Bootstrap CSS -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  
  <!-- Custom CSS -->
  ${page.css_content ? '<style>' + page.css_content + '</style>' : ''}
</head>
<body>
  ${page.html_content}
  
  <!-- Bootstrap JS -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  
  <!-- Socket.IO Client -->
  ${page.socket_events && page.socket_events.length > 0 ? '<script src="/socket.io/socket.io.js"></script>' : ''}
  
  <!-- Custom JavaScript -->
  ${page.javascript_content ? '<script>' + page.javascript_content + '</script>' : ''}
</body>
</html>`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

module.exports = router;
