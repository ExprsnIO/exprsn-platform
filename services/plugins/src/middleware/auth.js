'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Plugins-module auth middleware.
 *
 *  · requireAdmin  — CA bearer whose token email is a platform admin (same
 *    source of truth as the moderator admin endpoints). Lifecycle/catalog
 *    mutations are admin-only.
 *  · requireUser   — CA bearer → req.userId (user-scope installs).
 *  · authenticatePlugin — inbound plugin callback. Per the decisions ledger the
 *    MVP inbound auth is a DERIVED SERVICE TOKEN: X-Service-ID: plugin:<key> +
 *    X-Service-Token (HMAC). Loads the installation onto req.plugin.
 *  · requirePluginCapability(cap) — checks the grant set of req.plugin.
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const { createLogger } = require('@exprsn/shared');
const { deriveServiceToken, verifyServiceToken } = require('@exprsn/shared/utils/serviceToken');
const { getInternalHttpsAgent } = require('@exprsn/shared/utils/httpAgent');
const { isPlatformAdmin } = require('@exprsn/shared/utils/platformAdmin');

const logger = createLogger('exprsn-plugins-auth');
const CA_URL = process.env.CA_URL || process.env.CA_BASE_URL || 'http://localhost:3000';

function serviceHeaders() {
  const serviceId = process.env.SERVICE_ID || process.env.SERVICE_NAME || 'platform';
  try { return { 'X-Service-ID': serviceId, 'X-Service-Token': deriveServiceToken(serviceId) }; }
  catch { return {}; }
}

async function validateBearer(req) {
  const auth = req.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data } = await axios.post(
    `${CA_URL}/api/tokens/validate`,
    { token, requiredPermissions: { read: true } },
    { timeout: 5000, headers: serviceHeaders(), httpsAgent: getInternalHttpsAgent() },
  );
  if (!data.valid || !data.userId) return null;
  return { userId: data.userId, email: data.tokenData && data.tokenData.email };
}

function requireUser(req, res, next) {
  validateBearer(req)
    .then((identity) => {
      if (!identity) return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Valid bearer required' });
      req.userId = identity.userId;
      req.userEmail = identity.email;
      next();
    })
    .catch((err) => {
      logger.warn('Plugin user auth error', { error: err.message });
      res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token validation failed' });
    });
}

function requireAdmin(req, res, next) {
  validateBearer(req)
    .then((identity) => {
      if (!identity) return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Valid bearer required' });
      if (!isPlatformAdmin(identity.email)) return res.status(403).json({ error: 'FORBIDDEN', message: 'Platform admin required' });
      req.userId = identity.userId;
      req.userEmail = identity.email;
      next();
    })
    .catch((err) => {
      logger.warn('Plugin admin auth error', { error: err.message });
      res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token validation failed' });
    });
}

async function authenticatePlugin(req, res, next) {
  const serviceId = req.get('X-Service-ID') || '';
  const token = req.get('X-Service-Token') || '';
  if (!serviceId.startsWith('plugin:') || !verifyServiceToken(serviceId, token)) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Valid plugin service token required' });
  }
  const pluginKey = serviceId.slice('plugin:'.length);
  try {
    const { Plugin, PluginInstallation, PluginGrant } = require('../models');
    const installation = await PluginInstallation.findOne({
      where: { id: req.params.installationId, status: 'enabled' },
      include: [
        { model: Plugin, as: 'plugin', where: { pluginKey }, required: true },
        { model: PluginGrant, as: 'grants', required: false },
      ],
    });
    if (!installation) return res.status(404).json({ error: 'NOT_FOUND', message: 'No enabled installation for this plugin' });
    req.plugin = {
      key: pluginKey,
      installation,
      grants: (installation.grants || []).map((g) => g.capability),
    };
    next();
  } catch (err) {
    logger.warn('authenticatePlugin error', { error: err.message });
    res.status(500).json({ error: 'PLUGIN_AUTH_ERROR', message: 'Plugin authentication failed' });
  }
}

function requirePluginCapability(capability) {
  return (req, res, next) => {
    if (!req.plugin) return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Plugin authentication required' });
    if (!req.plugin.grants.includes(capability)) {
      return res.status(403).json({ error: 'CAPABILITY_DENIED', message: `Missing capability ${capability}`, required: capability });
    }
    next();
  };
}

module.exports = { requireUser, requireAdmin, authenticatePlugin, requirePluginCapability, validateBearer };
