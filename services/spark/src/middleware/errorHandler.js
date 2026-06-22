/**
 * Exprsn Spark - Error Handler Middleware
 */

const logger = require('../utils/logger');

/**
 * Not found handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
    path: req.path
  });
}

/**
 * Global error handler
 */
function errorHandler(err, req, res, next) {
  logger.error('Application error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: err.message,
      details: err.details
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid or expired token'
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: 'CONFLICT',
      message: 'Resource already exists'
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    error: err.name || 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'An error occurred'
      : err.message
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
