/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - Validation Utilities
 * ═══════════════════════════════════════════════════════════════════════
 */

const sanitizeHtml = require('sanitize-html');
const linkifyIt = require('linkify-it')();
const config = require('../config');

/**
 * Validate post content
 */
function validatePostContent(content) {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'Content is required' };
  }

  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Content cannot be empty' };
  }

  if (trimmed.length > config.feed.maxPostLength) {
    return { valid: false, error: `Content exceeds maximum length of ${config.feed.maxPostLength} characters` };
  }

  return { valid: true, content: trimmed };
}

/**
 * Sanitize HTML content
 */
function sanitizeContent(content) {
  return sanitizeHtml(content, {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'br'],
    allowedAttributes: {
      'a': ['href', 'title', 'target']
    },
    allowedSchemes: ['http', 'https'],
    transformTags: {
      'a': (tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer'
        }
      })
    }
  });
}

/**
 * Extract links from content
 */
function extractLinks(content) {
  const matches = linkifyIt.match(content);
  return matches ? matches.map(match => match.url) : [];
}

/**
 * Extract hashtags from content
 */
function extractHashtags(content) {
  const hashtagRegex = /#[\w\u0080-\uFFFF]+/g;
  const matches = content.match(hashtagRegex);
  return matches ? matches.map(tag => tag.toLowerCase()) : [];
}

/**
 * Extract mentions from content
 */
function extractMentions(content) {
  const mentionRegex = /@[\w\u0080-\uFFFF]+/g;
  const matches = content.match(mentionRegex);
  return matches ? matches.map(mention => mention.substring(1).toLowerCase()) : [];
}

/**
 * Validate visibility setting
 */
function validateVisibility(visibility) {
  const validOptions = ['public', 'followers', 'mentions'];
  return validOptions.includes(visibility) ? visibility : 'public';
}

/**
 * Validate media IDs
 */
function validateMediaIds(mediaIds, maxCount = config.feed.maxMediaPerPost) {
  if (!mediaIds) return { valid: true, mediaIds: [] };

  if (!Array.isArray(mediaIds)) {
    return { valid: false, error: 'Media IDs must be an array' };
  }

  if (mediaIds.length > maxCount) {
    return { valid: false, error: `Maximum ${maxCount} media items allowed per post` };
  }

  // Validate each ID is a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const id of mediaIds) {
    if (!uuidRegex.test(id)) {
      return { valid: false, error: `Invalid media ID format: ${id}` };
    }
  }

  return { valid: true, mediaIds };
}

/**
 * Validate pagination parameters
 */
function validatePagination(limit, offset) {
  const validLimit = Math.min(Math.max(parseInt(limit) || config.feed.pageSize, 1), 100);
  const validOffset = Math.max(parseInt(offset) || 0, 0);

  return { limit: validLimit, offset: validOffset };
}

module.exports = {
  validatePostContent,
  sanitizeContent,
  extractLinks,
  extractHashtags,
  extractMentions,
  validateVisibility,
  validateMediaIds,
  validatePagination
};
