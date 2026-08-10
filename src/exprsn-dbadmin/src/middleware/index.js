const {
  authenticate,
  requireAdmin,
  requireDBPermissions,
  auditLogger,
  rateLimitSensitiveOps,
  validateConnectionOwnership
} = require('./auth');

module.exports = {
  authenticate,
  requireAdmin,
  requireDBPermissions,
  auditLogger,
  rateLimitSensitiveOps,
  validateConnectionOwnership
};
