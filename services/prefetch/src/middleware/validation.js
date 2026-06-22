/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - Validation Middleware
 * Input validation for prefetch service routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const { AppError, isValidUUID } = require('@exprsn/shared');

/**
 * Validate UUID parameter
 */
function validateUUID(paramName) {
  return (req, res, next) => {
    const value = req.params[paramName];

    if (!isValidUUID(value)) {
      return next(new AppError(
        `Invalid ${paramName}`,
        400,
        'INVALID_UUID'
      ));
    }

    next();
  };
}

/**
 * Validate prefetch priority
 */
function validatePriority(req, res, next) {
  const { priority = 'medium' } = req.body;
  const validPriorities = ['high', 'medium', 'low'];

  if (!validPriorities.includes(priority)) {
    return next(new AppError(
      'Invalid priority. Must be high, medium, or low',
      400,
      'INVALID_PRIORITY'
    ));
  }

  req.body.priority = priority;
  next();
}

/**
 * Validate pagination parameters
 */
function validatePagination(req, res, next) {
  const { limit = 20, offset = 0 } = req.query;

  const parsedLimit = parseInt(limit, 10);
  const parsedOffset = parseInt(offset, 10);

  if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return next(new AppError(
      'Invalid limit parameter. Must be between 1 and 100',
      400,
      'INVALID_LIMIT'
    ));
  }

  if (isNaN(parsedOffset) || parsedOffset < 0) {
    return next(new AppError(
      'Invalid offset parameter. Must be >= 0',
      400,
      'INVALID_OFFSET'
    ));
  }

  req.query.limit = parsedLimit;
  req.query.offset = parsedOffset;
  next();
}

module.exports = {
  validateUUID,
  validatePriority,
  validatePagination
};
