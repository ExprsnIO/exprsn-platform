/**
 * Exprsn Spark - Middleware Index
 */

const { validateCAToken, optionalAuth } = require('./auth');
const { notFoundHandler, errorHandler } = require('./errorHandler');

module.exports = {
  validateCAToken,
  optionalAuth,
  notFoundHandler,
  errorHandler
};
