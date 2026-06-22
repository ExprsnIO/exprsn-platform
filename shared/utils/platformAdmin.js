'use strict';

/**
 * Platform admin allowlist.
 *
 * The consolidated platform has no global RBAC table (the CA's ca.users/ca.roles
 * are unseeded), so "who is a platform admin" is governed by an email allowlist.
 * Used in two places:
 *   - auth login: admins are minted a full-permission CA token.
 *   - CA admin routes: a bearer whose token email is an admin is granted access
 *     alongside the existing browser-session path.
 *
 * Configure with PLATFORM_ADMIN_EMAILS (comma-separated). Defaults to the dev
 * tester so a fresh checkout has a working admin.
 */
function adminEmailSet() {
  const raw = process.env.PLATFORM_ADMIN_EMAILS || 'tester@exprsn.io';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isPlatformAdmin(email) {
  if (!email) return false;
  return adminEmailSet().has(String(email).toLowerCase());
}

module.exports = { isPlatformAdmin };
