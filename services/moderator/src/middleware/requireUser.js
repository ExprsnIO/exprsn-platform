/**
 * End-user guard for moderator HTTP routes.
 *
 * Validates the CA bearer against the in-process CA exactly like `requireAdmin`,
 * but WITHOUT the admin/role gate — any valid CA bearer passes. Binds
 * `req.userId` (+ `req.userEmail`) to the VALIDATED token so submit handlers
 * (report / appeal submit) attribute the actor to the authenticated user and
 * never to a client-supplied body field (BUG-010 / SPIKE-001).
 */
const axios = require('axios');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const { getInternalHttpsAgent } = require('@exprsn/shared/utils/httpAgent');
const logger = require('../utils/logger');

const CA_URL = process.env.CA_URL || process.env.CA_BASE_URL || 'http://localhost:3000';

function serviceHeaders() {
  const id = process.env.SERVICE_ID || process.env.SERVICE_NAME;
  if (!id) return {};
  try {
    return { 'X-Service-ID': id, 'X-Service-Token': deriveServiceToken(id) };
  } catch (_) {
    return {};
  }
}

module.exports = async function requireUser(req, res, next) {
  try {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ error: 'MISSING_TOKEN', message: 'Authentication required' });

    const { data } = await axios.post(
      `${CA_URL}/api/tokens/validate`,
      { token, requiredPermissions: { read: true } },
      { timeout: 5000, headers: serviceHeaders(), httpsAgent: getInternalHttpsAgent() }
    );
    if (!data.valid || !data.userId) {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token is not valid' });
    }

    req.userId = data.userId;
    req.userEmail = data.tokenData && data.tokenData.email;
    next();
  } catch (error) {
    logger.warn('requireUser failed', { error: error.message });
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token validation failed' });
  }
};
