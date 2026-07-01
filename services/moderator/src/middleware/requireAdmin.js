/**
 * Admin guard for moderator HTTP routes.
 *
 * Validates the CA bearer against the in-process CA (the moderator's local
 * tokenValidation rejects the platform's UUID bearer), then authorizes via
 * platform-admin email OR an admin role on the token. Mirrors the source of
 * truth used by the /moderation socket + the other admin HTTP guards.
 */
const axios = require('axios');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');
const { getInternalHttpsAgent } = require('@exprsn/shared/utils/httpAgent');
const { isPlatformAdmin } = require('@exprsn/shared/utils/platformAdmin');
const logger = require('../utils/logger');

const CA_URL = process.env.CA_URL || process.env.CA_BASE_URL || 'http://localhost:3000';
const ADMIN_ROLES = ['admin', 'super-admin', 'super_admin', 'platform-admin', 'moderator'];

function serviceHeaders() {
  const id = process.env.SERVICE_ID || process.env.SERVICE_NAME;
  if (!id) return {};
  try {
    return { 'X-Service-ID': id, 'X-Service-Token': deriveServiceToken(id) };
  } catch (_) {
    return {};
  }
}

module.exports = async function requireAdmin(req, res, next) {
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

    const email = data.tokenData && data.tokenData.email;
    const roles = (data.tokenData && data.tokenData.roles) || [];
    const ok = isPlatformAdmin(email) || roles.some((r) => ADMIN_ROLES.includes(r));
    if (!ok) return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin privileges required' });

    req.userId = data.userId;
    req.userEmail = email;
    req.userRoles = roles;
    next();
  } catch (error) {
    logger.warn('requireAdmin failed', { error: error.message });
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token validation failed' });
  }
};
