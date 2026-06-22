/**
 * ═══════════════════════════════════════════════════════════
 * Error Handler Middleware
 * Centralized error handling for Express
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');

/**
 * Global error handler
 */
function errorHandler(err, req, res, next) {
  // Log error
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  // Default error response
  const response = {
    error: err.name || 'INTERNAL_ERROR',
    message: err.message || 'An internal error occurred',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Send response
  res.status(statusCode).json(response);
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route not found: ${req.method} ${req.path}`
  });
}

/**
 * Async error wrapper
 * Catches errors from async route handlers
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation error handler
 */
function validationError(errors) {
  const error = new Error('Validation failed');
  error.statusCode = 400;
  error.name = 'VALIDATION_ERROR';
  error.errors = errors;
  return error;
}

/**
 * Custom error classes
 */
class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BAD_REQUEST';
    this.statusCode = 400;
  }
}

class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UNAUTHORIZED';
    this.statusCode = 401;
  }
}

class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FORBIDDEN';
    this.statusCode = 403;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NOT_FOUND';
    this.statusCode = 404;
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CONFLICT';
    this.statusCode = 409;
  }
}

class TooManyRequestsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TOO_MANY_REQUESTS';
    this.statusCode = 429;
  }
}

class InternalServerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'INTERNAL_SERVER_ERROR';
    this.statusCode = 500;
  }
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  validationError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
  InternalServerError
};
