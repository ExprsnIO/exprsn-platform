const sanitizeHtml = require('sanitize-html');

/**
 * ═══════════════════════════════════════════════════════════
 * Sanitization Utilities
 * Prevents XSS attacks by sanitizing user-generated content
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Sanitize HTML content for descriptions, posts, etc.
 * Allows safe HTML tags but removes dangerous content
 */
const defaultSanitizeOptions = {
  allowedTags: [
    'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
    'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
  ],
  allowedAttributes: {
    'a': ['href', 'title', 'target'],
    'img': ['src', 'alt', 'title']
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data']
  }
};

/**
 * Sanitize rich text content (descriptions, bio, etc.)
 * @param {string} html - HTML content to sanitize
 * @param {object} options - Custom sanitization options
 * @returns {string} Sanitized HTML
 */
function sanitizeRichText(html, options = {}) {
  if (!html || typeof html !== 'string') {
    return '';
  }

  return sanitizeHtml(html, {
    ...defaultSanitizeOptions,
    ...options
  });
}

/**
 * Sanitize plain text (removes all HTML)
 * @param {string} text - Text to sanitize
 * @returns {string} Plain text without HTML
 */
function sanitizePlainText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return sanitizeHtml(text, {
    allowedTags: [],
    allowedAttributes: {}
  });
}

/**
 * Sanitize group data
 * @param {object} groupData - Group data object
 * @returns {object} Sanitized group data
 */
function sanitizeGroupData(groupData) {
  return {
    ...groupData,
    name: sanitizePlainText(groupData.name),
    description: sanitizeRichText(groupData.description),
    rules: groupData.rules ? sanitizeRichText(groupData.rules) : null,
    about: groupData.about ? sanitizeRichText(groupData.about) : null
  };
}

/**
 * Sanitize event data
 * @param {object} eventData - Event data object
 * @returns {object} Sanitized event data
 */
function sanitizeEventData(eventData) {
  return {
    ...eventData,
    title: sanitizePlainText(eventData.title),
    description: sanitizeRichText(eventData.description),
    location: eventData.location ? sanitizePlainText(eventData.location) : null
  };
}

/**
 * Sanitize proposal data
 * @param {object} proposalData - Proposal data object
 * @returns {object} Sanitized proposal data
 */
function sanitizeProposalData(proposalData) {
  return {
    ...proposalData,
    title: sanitizePlainText(proposalData.title),
    description: sanitizeRichText(proposalData.description),
    rationale: proposalData.rationale ? sanitizeRichText(proposalData.rationale) : null
  };
}

/**
 * Sanitize comment/message data
 * @param {object} data - Comment/message data object
 * @returns {object} Sanitized data
 */
function sanitizeCommentData(data) {
  return {
    ...data,
    content: sanitizeRichText(data.content || data.message || data.text)
  };
}

/**
 * Sanitize an object recursively
 * Sanitizes all string values in nested objects
 * @param {object} obj - Object to sanitize
 * @param {Function} sanitizer - Sanitization function (default: sanitizePlainText)
 * @returns {object} Sanitized object
 */
function sanitizeObject(obj, sanitizer = sanitizePlainText) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === 'string') {
        return sanitizer(item);
      } else if (typeof item === 'object' && item !== null) {
        return sanitizeObject(item, sanitizer);
      } else {
        return item;
      }
    });
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizer(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value, sanitizer);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

module.exports = {
  sanitizeRichText,
  sanitizePlainText,
  sanitizeGroupData,
  sanitizeEventData,
  sanitizeProposalData,
  sanitizeCommentData,
  sanitizeObject,
  defaultSanitizeOptions
};
