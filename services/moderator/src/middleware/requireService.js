/**
 * Service-to-service guard for moderator HTTP routes.
 *
 * Requires a valid per-service HMAC token (`X-Service-ID` / `X-Service-Token`),
 * verified constant-time via the shared `verifyServiceToken`. Extracted from the
 * inline gate in `src/routes/notifications.js` so the inter-module moderation
 * submit/status surface (`POST /api/moderate/content`, `/batch`) can reuse it
 * (BUG-010 / SPIKE-001). Sets `req.serviceId` on success.
 */
const { verifyServiceToken } = require('@exprsn/shared/utils/serviceToken');
const logger = require('../utils/logger');

module.exports = function requireService(req, res, next) {
  const serviceId = req.get('X-Service-ID');
  const token = req.get('X-Service-Token');
  if (!verifyServiceToken(serviceId, token)) {
    logger.warn('Rejected service call: invalid service token', { serviceId });
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Valid X-Service-ID / X-Service-Token required'
    });
  }
  req.serviceId = serviceId;
  next();
};
