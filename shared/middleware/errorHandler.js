/**
 * ═══════════════════════════════════════════════════════════
 * Error Handling Middleware
 * Centralized error handling for all Exprsn services
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Application error class
 */
class AppError extends Error {
  constructor(message, statusCode, errorCode) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handler middleware
 */
function errorHandler(err, req, res, next) {
  let { statusCode = 500, message, errorCode } = err;
  const correlationId = crypto.randomUUID();

  // Log full error server-side with correlation id
  logger.error('Error occurred', {
    correlationId,
    errorCode,
    message,
    statusCode,
    path: req.path,
    method: req.method,
    userId: req.userId,
    stack: err.stack
  });

  // Fail safe: only expose error details for known operational errors.
  // Anything else (including when NODE_ENV is unset) gets a generic message.
  if (err.isOperational !== true) {
    message = 'Internal server error';
    errorCode = 'INTERNAL_ERROR';
  }

  res.status(statusCode).json({
    error: errorCode || 'ERROR',
    message,
    correlationId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * 404 handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`
  });
}

/**
 * Async handler wrapper to catch errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler
};
