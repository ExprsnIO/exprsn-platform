const logger = require('../utils/logger');

/**
 * Global error handling middleware
 * Catches all errors and returns appropriate responses
 */
function errorHandler(err, req, res, next) {
  // Log the error
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id
  });

  // Default error response
  let status = err.status || err.statusCode || 500;
  let errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    status = 400;
    errorCode = 'VALIDATION_ERROR';
  } else if (err.name === 'SequelizeValidationError') {
    status = 400;
    errorCode = 'DATABASE_VALIDATION_ERROR';
    message = err.errors.map(e => e.message).join(', ');
  } else if (err.name === 'SequelizeUniqueConstraintError') {
    status = 409;
    errorCode = 'DUPLICATE_ENTRY';
    message = 'A record with this value already exists';
  } else if (err.name === 'SequelizeForeignKeyConstraintError') {
    status = 400;
    errorCode = 'FOREIGN_KEY_VIOLATION';
    message = 'Referenced record does not exist';
  } else if (err.name === 'UnauthorizedError' || err.code === 'UNAUTHORIZED') {
    status = 401;
    errorCode = 'UNAUTHORIZED';
    message = 'Authentication required';
  } else if (err.code === 'TOKEN_EXPIRED') {
    status = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Token has expired';
  } else if (err.code === 'INVALID_TOKEN') {
    status = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid token provided';
  } else if (err.name === 'ForbiddenError' || err.code === 'FORBIDDEN') {
    status = 403;
    errorCode = 'FORBIDDEN';
    message = 'You do not have permission to perform this action';
  } else if (err.name === 'NotFoundError' || err.code === 'NOT_FOUND') {
    status = 404;
    errorCode = 'NOT_FOUND';
    message = err.message || 'Resource not found';
  }

  // Don't expose internal errors in production
  if (status === 500 && process.env.NODE_ENV === 'production') {
    message = 'An internal server error occurred';
  }

  // Send error response
  res.status(status).json({
    error: errorCode,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err.details
    })
  });
}

module.exports = errorHandler;
