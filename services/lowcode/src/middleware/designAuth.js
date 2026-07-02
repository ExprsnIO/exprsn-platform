'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Design-time authorization for the low-code studio.
 *
 * Replaces the old blanket platform-admin gate with real scope authority: any
 * authenticated user may REACH the design API, but each resource mutation/read
 * is authorized against the target scope (platform/org/group/user) via
 * scopeAuthority. Platform admins remain superusers.
 *
 *   requireDesignIdentity — authenticate the bearer; attach req.userId/email and
 *                           req.isPlatformAdmin (superuser flag).
 *   assertScope(req, type, id)  — 403 unless the caller can admin that scope.
 *   assertApp(req, appId|app)   — 403 unless the caller can admin the app's scope
 *                                 (null appId = platform-global → platform admin).
 * ═══════════════════════════════════════════════════════════
 */

const { isPlatformAdmin } = require('@exprsn/shared/utils/platformAdmin');
const { validateBearer } = require('../../../plugins/src/middleware/auth');
const scopeAuthority = require('../services/scopeAuthority');
const { LcApp } = require('../models');

function requireDesignIdentity(req, res, next) {
  validateBearer(req)
    .then((identity) => {
      if (!identity) return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Valid bearer required' });
      req.userId = identity.userId;
      req.userEmail = identity.email;
      req.isPlatformAdmin = isPlatformAdmin(identity.email);
      req.identity = { userId: identity.userId, email: identity.email, isPlatformAdmin: req.isPlatformAdmin };
      next();
    })
    .catch(() => res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token validation failed' }));
}

function forbidden(message) { const e = new Error(message || 'Not authorized for this scope'); e.status = 403; e.code = 'FORBIDDEN'; return e; }

/** Throw 403 unless the caller can administer (scopeType, scopeId). */
async function assertScope(req, scopeType, scopeId) {
  const ok = await scopeAuthority.canAdminScope(req.identity, scopeType, scopeId);
  if (!ok) throw forbidden(`Requires ${scopeType} admin authority`);
}

/**
 * Throw 403 unless the caller can administer the app's scope. A null/absent
 * appId means a platform-global resource (e.g. shared lookup) → platform admin.
 */
async function assertApp(req, appIdOrApp) {
  if (!appIdOrApp) { if (!req.isPlatformAdmin) throw forbidden('Platform admin required for global resources'); return; }
  const app = typeof appIdOrApp === 'string' ? await LcApp.findByPk(appIdOrApp, { attributes: ['id', 'scopeType', 'scopeId'] }) : appIdOrApp;
  if (!app) { const e = new Error('app not found'); e.status = 404; e.code = 'NOT_FOUND'; throw e; }
  const ok = await scopeAuthority.canAdminApp(req.identity, app);
  if (!ok) throw forbidden('Not authorized for this app');
}

module.exports = { requireDesignIdentity, assertScope, assertApp, forbidden };
