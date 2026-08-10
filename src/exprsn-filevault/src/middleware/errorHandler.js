/**
 * ═══════════════════════════════════════════════════════════════════════
 * Error Handler Middleware
 * ═══════════════════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');
const config = require('../config');

/**
 * Map common errors to HTTP status codes
 */
const errorMap = {
  FILE_NOT_FOUND: 404,
  DIRECTORY_NOT_FOUND: 404,
  VERSION_NOT_FOUND: 404,
  SHARE_LINK_NOT_FOUND: 404,
  PARENT_DIRECTORY_NOT_FOUND: 404,

  INSUFFICIENT_PERMISSIONS: 403,
  UNAUTHORIZED: 401,
  TOKEN_EXPIRED: 401,
  INVALID_TOKEN: 401,

  FILE_TOO_LARGE: 413,
  MAX_VERSIONS_EXCEEDED: 400,
  DIRECTORY_NOT_EMPTY: 400,
  DIRECTORY_ALREADY_EXISTS: 409,
  CANNOT_MOVE_INTO_DESCENDANT: 400,
  DIFF_NOT_SUPPORTED_FOR_BINARY_FILES: 400,
  SHARE_LINK_EXPIRED: 410,
  SHARE_LINK_EXHAUSTED: 410,

  INVALID_UUID: 400,
  MISSING_PARAMETER: 400,
  MISSING_FIELDS: 400,
  NO_FILE: 400,
  UPLOAD_ERROR: 400
};

/**
 * Global error handler
 */
function errorHandler(err, req, res, next) {
  // Log error
  logger.error('Request error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.userId
  });

  // Determine status code
  const statusCode = errorMap[err.message] || err.statusCode || 500;

  // Prepare error response
  const errorResponse = {
    error: err.message || 'INTERNAL_SERVER_ERROR',
    message: getErrorMessage(err.message)
  };

  // Include stack trace in development
  if (config.app.env === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.details = err;
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * Get user-friendly error message
 */
function getErrorMessage(errorCode) {
  const messages = {
    FILE_NOT_FOUND: 'The requested file was not found',
    DIRECTORY_NOT_FOUND: 'The requested directory was not found',
    VERSION_NOT_FOUND: 'The requested version was not found',
    SHARE_LINK_NOT_FOUND: 'The share link was not found',
    INSUFFICIENT_PERMISSIONS: 'You do not have permission to perform this action',
    UNAUTHORIZED: 'Authentication required',
    TOKEN_EXPIRED: 'Your authentication token has expired',
    INVALID_TOKEN: 'Invalid authentication token',
    FILE_TOO_LARGE: 'The file is too large',
    MAX_VERSIONS_EXCEEDED: 'Maximum number of versions exceeded',
    DIRECTORY_NOT_EMPTY: 'Directory is not empty',
    DIRECTORY_ALREADY_EXISTS: 'A directory with this name already exists',
    SHARE_LINK_EXPIRED: 'This share link has expired',
    SHARE_LINK_EXHAUSTED: 'This share link has been used the maximum number of times'
  };

  return messages[errorCode] || 'An error occurred';
}

/**
 * 404 handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'The requested resource was not found',
    path: req.path
  });
}

/**
 * Async route wrapper - catches async errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
