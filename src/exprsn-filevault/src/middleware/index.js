/**
 * ═══════════════════════════════════════════════════════════════════════
 * Middleware Index
 * ═══════════════════════════════════════════════════════════════════════
 */

const auth = require('./auth');
const upload = require('./upload');
const validation = require('./validation');
const errorHandler = require('./errorHandler');

module.exports = {
  ...auth,
  ...upload,
  ...validation,
  ...errorHandler
};
