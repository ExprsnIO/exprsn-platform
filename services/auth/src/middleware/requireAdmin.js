/**
 * ═══════════════════════════════════════════════════════════
 * requireAdmin — JSON admin authorization for the auth module
 *
 * The consolidated platform has no seeded global RBAC table, so "who is an
 * administrator" is governed primarily by the PLATFORM_ADMIN_EMAILS allowlist
 * (`@exprsn/shared/utils/platformAdmin`), the same source of truth the CA,
 * moderator, and atproto admin guards use. We ALSO honor a DB `admin` /
 * `system_admin` role (or an `admin:*` permission) so seeded role-based admins
 * work once RBAC is populated.
 *
 * Unlike the legacy `middleware/adminAuth.js` (which redirects / renders HTML and
 * is meant for the removed server-rendered pages), these guards always return
 * JSON 401/403 — never a redirect — so an SPA `fetch` gets a real status instead
 * of following a redirect into a 404 (the `[object Object]` class of bug).
 *
 * Two entry points cover the module's two auth styles:
 *   - requireAdminBearer / requireAdminAfterCA — CA-bearer routes (req.userId /
 *     req.tokenData, populated by validateCAToken).
 *   - requireAdminUser — passport/bearer-session routes (req.user, populated by
 *     requireAuth / bearerAuth).
 * ═══════════════════════════════════════════════════════════
 */

const { validateCAToken } = require('@exprsn/shared');
const { isPlatformAdmin } = require('@exprsn/shared/utils/platformAdmin');
const { User, Role } = require('../models');

/** True if the user holds a DB admin/system_admin role or an `admin:*` permission. */
async function hasAdminRole(userId) {
  if (!userId) {
    return false;
  }

  const user = await User.findByPk(userId, {
    include: [{ model: Role, as: 'roles', through: { attributes: [] } }]
  });

  if (!user || !Array.isArray(user.roles)) {
    return false;
  }

  return user.roles.some((role) =>
    role.name === 'admin' ||
    role.name === 'system_admin' ||
    (Array.isArray(role.permissions) && role.permissions.includes('admin:*'))
  );
}

function deny(res) {
  return res.status(403).json({
    error: 'FORBIDDEN',
    message: 'Administrator privileges required'
  });
}

/**
 * Admin check for routes that have ALREADY validated a CA token (req.userId /
 * req.tokenData are set). Use after a `validateCAToken(...)` on the router/route
 * so the CA validator isn't run twice.
 */
function requireAdminAfterCA(req, res, next) {
  Promise.resolve()
    .then(async () => {
      const email = req.tokenData && req.tokenData.email;
      if (isPlatformAdmin(email)) {
        return next();
      }
      if (await hasAdminRole(req.userId)) {
        return next();
      }
      return deny(res);
    })
    .catch(next);
}

// validateCAToken sends 401 itself on a missing/invalid token; its callback only
// runs on success (mirrors atproto's adminGuard).
const _validateCARead = validateCAToken({ requiredPermissions: ['read'] });

/** Standalone CA-bearer admin guard: validates the token, then checks admin. */
function requireAdminBearer(req, res, next) {
  return _validateCARead(req, res, () => requireAdminAfterCA(req, res, next));
}

/**
 * Admin check for passport/bearer-session routes (req.user populated by
 * requireAuth / bearerAuth). Assumes authentication already ran.
 */
function requireAdminUser(req, res, next) {
  Promise.resolve()
    .then(async () => {
      const email = req.user && req.user.email;
      const userId = req.user && req.user.id;
      if (isPlatformAdmin(email)) {
        return next();
      }
      if (await hasAdminRole(userId)) {
        return next();
      }
      return deny(res);
    })
    .catch(next);
}

module.exports = {
  hasAdminRole,
  requireAdminAfterCA,
  requireAdminBearer,
  requireAdminUser
};
