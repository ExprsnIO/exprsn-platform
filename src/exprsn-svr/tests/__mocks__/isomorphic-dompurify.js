/**
 * Mock for isomorphic-dompurify
 * Provides basic sanitization without ES module dependencies
 */

const DOMPurify = {
  sanitize: (dirty) => {
    // Basic HTML sanitization for testing
    if (typeof dirty !== 'string') return '';

    // Remove script tags and dangerous attributes
    return dirty
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript:/gi, '');
  }
};

module.exports = DOMPurify;
