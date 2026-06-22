/**
 * ═══════════════════════════════════════════════════════════
 * Content Processing Utilities
 * HTML sanitization, link extraction, hashtag parsing
 * ═══════════════════════════════════════════════════════════
 */

const sanitizeHtml = require('sanitize-html');
const LinkifyIt = require('linkify-it');
const emojiRegex = require('emoji-regex');

const linkify = new LinkifyIt();

/**
 * Sanitize HTML content
 */
function sanitizeContent(content) {
  return sanitizeHtml(content, {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'br'],
    allowedAttributes: {
      'a': ['href', 'rel', 'target']
    },
    allowedSchemes: ['http', 'https'],
    transformTags: {
      'a': (tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          rel: 'noopener noreferrer nofollow',
          target: '_blank'
        }
      })
    }
  });
}

/**
 * Extract URLs from content
 */
function extractUrls(content) {
  const matches = linkify.match(content);

  if (!matches) {
    return [];
  }

  return matches.map(match => ({
    url: match.url,
    text: match.text,
    index: match.index,
    lastIndex: match.lastIndex
  }));
}

/**
 * Extract hashtags from content
 */
function extractHashtags(content) {
  const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
  const hashtags = [];
  let match;

  while ((match = hashtagRegex.exec(content)) !== null) {
    hashtags.push({
      tag: match[1].toLowerCase(),
      text: match[0],
      index: match.index
    });
  }

  return hashtags;
}

/**
 * Extract mentions from content
 */
function extractMentions(content) {
  const mentionRegex = /@([a-zA-Z0-9_]+)/g;
  const mentions = [];
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push({
      username: match[1].toLowerCase(),
      text: match[0],
      index: match.index
    });
  }

  return mentions;
}

/**
 * Extract emojis from content
 */
function extractEmojis(content) {
  const regex = emojiRegex();
  const emojis = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    emojis.push({
      emoji: match[0],
      index: match.index
    });
  }

  return emojis;
}

/**
 * Process post content
 * Extract all entities and sanitize
 */
function processContent(content) {
  // Sanitize HTML
  const sanitized = sanitizeContent(content);

  // Extract entities
  const urls = extractUrls(content);
  const hashtags = extractHashtags(content);
  const mentions = extractMentions(content);
  const emojis = extractEmojis(content);

  return {
    content: sanitized,
    entities: {
      urls,
      hashtags,
      mentions,
      emojis
    },
    metadata: {
      hasUrls: urls.length > 0,
      hasHashtags: hashtags.length > 0,
      hasMentions: mentions.length > 0,
      hasEmojis: emojis.length > 0,
      urlCount: urls.length,
      hashtagCount: hashtags.length,
      mentionCount: mentions.length,
      emojiCount: emojis.length
    }
  };
}

/**
 * Generate post preview/snippet
 */
function generatePreview(content, maxLength = 100) {
  // Strip HTML tags
  const plainText = content.replace(/<[^>]*>/g, '');

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return plainText.substring(0, maxLength).trim() + '...';
}

/**
 * Calculate reading time
 */
function calculateReadingTime(content) {
  const wordsPerMinute = 200;
  const words = content.trim().split(/\s+/).length;
  const minutes = Math.ceil(words / wordsPerMinute);

  return {
    words,
    minutes,
    text: minutes === 1 ? '1 min read' : `${minutes} min read`
  };
}

module.exports = {
  sanitizeContent,
  extractUrls,
  extractHashtags,
  extractMentions,
  extractEmojis,
  processContent,
  generatePreview,
  calculateReadingTime
};
