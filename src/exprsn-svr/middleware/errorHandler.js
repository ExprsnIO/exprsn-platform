/**
 * ═══════════════════════════════════════════════════════════
 * Error Handler Middleware
 * Centralized error handling with logging and user-friendly responses
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode = 500, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handler middleware
 */
function errorHandler(err, req, res, next) {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;

  // Log error
  logger.logError(err, {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id
  });

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError') {
    const messages = err.errors.map(e => e.message);
    error.message = messages.join(', ');
    error.statusCode = 400;
  }

  // Sequelize unique constraint errors
  if (err.name === 'SequelizeUniqueConstraintError') {
    error.message = 'Duplicate entry found';
    error.statusCode = 409;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token';
    error.statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired';
    error.statusCode = 401;
  }

  // Send response
  const response = {
    success: false,
    error: {
      message: error.message || 'Internal server error',
      statusCode: error.statusCode
    }
  };

  // Include error details in development
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = err.stack;
    response.error.details = error.details;
  }

  res.status(error.statusCode).json(response);
}

/**
 * Async handler wrapper to catch promise rejections
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 handler
 */
function notFound(req, res, next) {
  const error = new AppError(`Route not found: ${req.originalUrl}`, 404);
  next(error);
}

module.exports = {
  AppError,
  errorHandler,
  asyncHandler,
  notFound
};
