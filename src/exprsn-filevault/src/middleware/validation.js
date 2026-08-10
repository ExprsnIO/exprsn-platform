/**
 * ═══════════════════════════════════════════════════════════════════════
 * Request Validation Middleware
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: isUUID } = require('uuid');

/**
 * Validate UUID parameter
 */
function validateUUID(paramName) {
  return (req, res, next) => {
    const value = req.params[paramName];

    if (!value) {
      return res.status(400).json({
        error: 'MISSING_PARAMETER',
        message: `Missing required parameter: ${paramName}`
      });
    }

    // Basic UUID v4 format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      return res.status(400).json({
        error: 'INVALID_UUID',
        message: `Invalid UUID format for parameter: ${paramName}`
      });
    }

    next();
  };
}

/**
 * Validate required body fields
 */
function validateBody(requiredFields) {
  return (req, res, next) => {
    const missing = [];

    for (const field of requiredFields) {
      if (!(field in req.body)) {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'Missing required fields',
        fields: missing
      });
    }

    next();
  };
}

/**
 * Validate pagination parameters
 */
function validatePagination(req, res, next) {
  const limit = parseInt(req.query.limit || '50', 10);
  const offset = parseInt(req.query.offset || '0', 10);

  if (isNaN(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({
      error: 'INVALID_LIMIT',
      message: 'Limit must be between 1 and 100'
    });
  }

  if (isNaN(offset) || offset < 0) {
    return res.status(400).json({
      error: 'INVALID_OFFSET',
      message: 'Offset must be a non-negative number'
    });
  }

  req.pagination = { limit, offset };
  next();
}

/**
 * Sanitize file path
 */
function sanitizePath(path) {
  // Remove any attempts at directory traversal
  return path.replace(/\.\./g, '').replace(/\/\//g, '/');
}

module.exports = {
  validateUUID,
  validateBody,
  validatePagination,
  sanitizePath
};
