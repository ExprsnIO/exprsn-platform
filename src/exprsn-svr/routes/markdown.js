/**
 * ═══════════════════════════════════════════════════════════
 * Markdown Routes
 * API endpoints for markdown content processing
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const markdownService = require('../services/markdownService');
const pageService = require('../services/pageService');
const { requireAuth } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

/**
 * @route   POST /api/markdown/convert
 * @desc    Convert markdown to HTML
 * @access  Public
 */
router.post('/convert', async (req, res, next) => {
  try {
    const { markdown, sanitize, includeToc } = req.body;

    if (!markdown) {
      throw new AppError('Markdown content is required', 400);
    }

    const html = markdownService.markdownToHtml(markdown, {
      sanitize: sanitize !== false,
      includeToc
    });

    res.json({
      success: true,
      data: {
        html
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/markdown/to-page
 * @desc    Convert markdown to complete HTML page
 * @access  Public
 */
router.post('/to-page', async (req, res, next) => {
  try {
    const { markdown, title, description, includeToc } = req.body;

    if (!markdown) {
      throw new AppError('Markdown content is required', 400);
    }

    const result = markdownService.markdownToPage(markdown, {
      title,
      description,
      includeToc: includeToc !== false
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/markdown/create-page
 * @desc    Create a page from markdown content
 * @access  Private
 */
router.post('/create-page', requireAuth, async (req, res, next) => {
  try {
    const { markdown, title, slug, description, isPublic, includeToc } = req.body;

    if (!markdown) {
      throw new AppError('Markdown content is required', 400);
    }

    if (!title) {
      throw new AppError('Page title is required', 400);
    }

    // Convert markdown to HTML page
    const result = markdownService.markdownToPage(markdown, {
      title,
      description,
      includeToc: includeToc !== false
    });

    // Create the page
    const page = await pageService.createPage({
      title: result.metadata.title || title,
      slug,
      description: result.metadata.description || description,
      htmlContent: result.html,
      isStatic: true,
      isPublic: isPublic !== undefined ? isPublic : false,
      status: 'published',
      pageData: {
        source: 'markdown',
        markdownContent: markdown,
        metadata: result.metadata,
        toc: result.toc
      }
    }, req.user.id);

    res.status(201).json({
      success: true,
      message: 'Page created from markdown successfully',
      data: page
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/markdown/extract-toc
 * @desc    Extract table of contents from markdown
 * @access  Public
 */
router.post('/extract-toc', async (req, res, next) => {
  try {
    const { markdown } = req.body;

    if (!markdown) {
      throw new AppError('Markdown content is required', 400);
    }

    const toc = markdownService.extractTableOfContents(markdown);
    const tocHtml = markdownService.generateTableOfContents(markdown);

    res.json({
      success: true,
      data: {
        toc,
        html: tocHtml
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/markdown/extract-frontmatter
 * @desc    Extract frontmatter metadata from markdown
 * @access  Public
 */
router.post('/extract-frontmatter', async (req, res, next) => {
  try {
    const { markdown } = req.body;

    if (!markdown) {
      throw new AppError('Markdown content is required', 400);
    }

    const result = markdownService.extractFrontmatter(markdown);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/markdown/to-markdown
 * @desc    Convert HTML to markdown
 * @access  Public
 */
router.post('/to-markdown', async (req, res, next) => {
  try {
    const { html } = req.body;

    if (!html) {
      throw new AppError('HTML content is required', 400);
    }

    const markdown = markdownService.htmlToMarkdown(html);

    res.json({
      success: true,
      data: {
        markdown
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/markdown/validate
 * @desc    Validate markdown syntax
 * @access  Public
 */
router.post('/validate', async (req, res, next) => {
  try {
    const { markdown } = req.body;

    if (!markdown) {
      throw new AppError('Markdown content is required', 400);
    }

    const validation = markdownService.validateMarkdown(markdown);

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/markdown/stats
 * @desc    Get markdown content statistics
 * @access  Public
 */
router.post('/stats', async (req, res, next) => {
  try {
    const { markdown } = req.body;

    if (!markdown) {
      throw new AppError('Markdown content is required', 400);
    }

    const stats = markdownService.getMarkdownStats(markdown);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
