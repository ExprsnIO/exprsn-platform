/**
 * ═══════════════════════════════════════════════════════════
 * Markdown Service
 * Business logic for markdown content processing
 * ═══════════════════════════════════════════════════════════
 */

const marked = require('marked');
const DOMPurify = require('isomorphic-dompurify');
const hljs = require('highlight.js');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class MarkdownService {
  constructor() {
    // Configure marked renderer
    this.renderer = new marked.Renderer();

    // Custom heading renderer to add IDs for table of contents
    this.renderer.heading = function(text, level) {
      const escapedText = text.toLowerCase().replace(/[^\w]+/g, '-');
      return `<h${level} id="${escapedText}" class="markdown-heading">${text}</h${level}>`;
    };

    // Custom code renderer with syntax highlighting
    this.renderer.code = function(code, language) {
      if (language && hljs.getLanguage(language)) {
        try {
          const highlighted = hljs.highlight(code, { language }).value;
          return `<pre class="hljs"><code class="language-${language}">${highlighted}</code></pre>`;
        } catch (error) {
          logger.warn('Failed to highlight code', { error: error.message, language });
        }
      }
      return `<pre><code>${code}</code></pre>`;
    };

    // Custom link renderer to add security attributes
    this.renderer.link = function(href, title, text) {
      const titleAttr = title ? ` title="${title}"` : '';
      const external = href.startsWith('http') && !href.includes(process.env.DOMAIN || 'localhost');
      const relAttr = external ? ' rel="noopener noreferrer"' : '';
      const targetAttr = external ? ' target="_blank"' : '';
      return `<a href="${href}"${titleAttr}${relAttr}${targetAttr}>${text}</a>`;
    };

    // Custom table renderer with Bootstrap classes
    this.renderer.table = function(header, body) {
      return `<div class="table-responsive">
        <table class="table table-striped table-hover">
          <thead>${header}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
    };

    // Custom blockquote renderer
    this.renderer.blockquote = function(quote) {
      return `<blockquote class="blockquote">${quote}</blockquote>`;
    };

    // Configure marked options
    marked.setOptions({
      renderer: this.renderer,
      gfm: true, // GitHub Flavored Markdown
      breaks: true, // Line breaks
      pedantic: false,
      smartLists: true,
      smartypants: true // Smart quotes and dashes
    });
  }

  /**
   * Convert markdown to HTML
   */
  markdownToHtml(markdown, options = {}) {
    try {
      if (!markdown) {
        return '';
      }

      // Parse markdown to HTML
      let html = marked.parse(markdown);

      // Sanitize HTML to prevent XSS
      if (options.sanitize !== false) {
        html = this.sanitizeHtml(html, options);
      }

      return html;
    } catch (error) {
      logger.error('Failed to convert markdown to HTML', { error: error.message });
      throw new AppError('Failed to process markdown content', 500);
    }
  }

  /**
   * Sanitize HTML content
   */
  sanitizeHtml(html, options = {}) {
    const config = {
      ALLOWED_TAGS: options.allowedTags || [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr',
        'a', 'img',
        'strong', 'em', 'u', 's', 'code', 'pre',
        'ul', 'ol', 'li',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'blockquote',
        'div', 'span'
      ],
      ALLOWED_ATTR: options.allowedAttributes || [
        'href', 'src', 'alt', 'title', 'class', 'id',
        'target', 'rel', 'width', 'height'
      ],
      ALLOWED_URI_REGEXP: options.allowedUriRegexp || /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
    };

    return DOMPurify.sanitize(html, config);
  }

  /**
   * Extract table of contents from markdown
   */
  extractTableOfContents(markdown) {
    try {
      const headings = [];
      const tokens = marked.lexer(markdown);

      for (const token of tokens) {
        if (token.type === 'heading') {
          const id = token.text.toLowerCase().replace(/[^\w]+/g, '-');
          headings.push({
            level: token.depth,
            text: token.text,
            id: id
          });
        }
      }

      return headings;
    } catch (error) {
      logger.error('Failed to extract table of contents', { error: error.message });
      return [];
    }
  }

  /**
   * Generate HTML table of contents
   */
  generateTableOfContents(markdown) {
    const headings = this.extractTableOfContents(markdown);

    if (headings.length === 0) {
      return '';
    }

    let toc = '<nav class="table-of-contents"><ul>';

    for (const heading of headings) {
      const indent = '  '.repeat(heading.level - 1);
      toc += `\n${indent}<li><a href="#${heading.id}">${heading.text}</a></li>`;
    }

    toc += '\n</ul></nav>';

    return toc;
  }

  /**
   * Extract metadata from markdown frontmatter (YAML)
   */
  extractFrontmatter(markdown) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    const match = markdown.match(frontmatterRegex);

    if (!match) {
      return {
        metadata: {},
        content: markdown
      };
    }

    try {
      const yaml = require('js-yaml');
      const metadata = yaml.load(match[1]);
      const content = markdown.substring(match[0].length);

      return {
        metadata,
        content
      };
    } catch (error) {
      logger.warn('Failed to parse frontmatter', { error: error.message });
      return {
        metadata: {},
        content: markdown
      };
    }
  }

  /**
   * Convert markdown file to HTML page
   */
  markdownToPage(markdown, options = {}) {
    try {
      // Extract frontmatter if present
      const { metadata, content } = this.extractFrontmatter(markdown);

      // Generate table of contents if requested
      const toc = options.includeToc ? this.generateTableOfContents(content) : '';

      // Convert markdown to HTML
      const bodyHtml = this.markdownToHtml(content, options);

      // Build complete HTML
      const title = metadata.title || options.title || 'Untitled';
      const description = metadata.description || options.description || '';

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${description ? `<meta name="description" content="${description}">` : ''}
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.7.0/styles/github.min.css">
  <style>
    .markdown-content {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1rem;
    }
    .table-of-contents {
      background: #f8f9fa;
      padding: 1rem;
      margin-bottom: 2rem;
      border-radius: 0.25rem;
    }
    .table-of-contents ul {
      list-style: none;
      padding-left: 0;
    }
    .table-of-contents li {
      margin: 0.5rem 0;
    }
    .markdown-heading {
      margin-top: 2rem;
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="markdown-content">
    ${toc}
    ${bodyHtml}
  </div>
</body>
</html>`;

      return {
        html,
        metadata,
        toc: toc ? this.extractTableOfContents(content) : []
      };
    } catch (error) {
      logger.error('Failed to convert markdown to page', { error: error.message });
      throw new AppError('Failed to create page from markdown', 500);
    }
  }

  /**
   * Convert HTML back to markdown (limited support)
   */
  htmlToMarkdown(html) {
    try {
      const TurndownService = require('turndown');
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced'
      });

      return turndownService.turndown(html);
    } catch (error) {
      logger.error('Failed to convert HTML to markdown', { error: error.message });
      throw new AppError('Failed to convert HTML to markdown', 500);
    }
  }

  /**
   * Validate markdown syntax
   */
  validateMarkdown(markdown) {
    try {
      marked.parse(markdown);
      return {
        valid: true,
        errors: []
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  /**
   * Get markdown statistics
   */
  getMarkdownStats(markdown) {
    try {
      const tokens = marked.lexer(markdown);

      const stats = {
        characters: markdown.length,
        words: markdown.split(/\s+/).length,
        lines: markdown.split('\n').length,
        headings: 0,
        paragraphs: 0,
        lists: 0,
        codeBlocks: 0,
        links: 0,
        images: 0,
        tables: 0
      };

      for (const token of tokens) {
        switch (token.type) {
          case 'heading':
            stats.headings++;
            break;
          case 'paragraph':
            stats.paragraphs++;
            break;
          case 'list':
            stats.lists++;
            break;
          case 'code':
            stats.codeBlocks++;
            break;
          case 'table':
            stats.tables++;
            break;
        }

        // Count links and images in token text
        if (token.type === 'paragraph' || token.type === 'text') {
          const linkMatches = (token.raw || '').match(/\[.*?\]\(.*?\)/g);
          const imageMatches = (token.raw || '').match(/!\[.*?\]\(.*?\)/g);
          stats.links += linkMatches ? linkMatches.length : 0;
          stats.images += imageMatches ? imageMatches.length : 0;
        }
      }

      // Calculate reading time (assuming 200 words per minute)
      stats.readingTimeMinutes = Math.ceil(stats.words / 200);

      return stats;
    } catch (error) {
      logger.error('Failed to get markdown stats', { error: error.message });
      return null;
    }
  }
}

module.exports = new MarkdownService();
