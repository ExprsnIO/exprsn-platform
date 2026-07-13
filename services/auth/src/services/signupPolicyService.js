/**
 * ═══════════════════════════════════════════════════════════════════════
 * Signup policy service (FEAT-033)
 * ═══════════════════════════════════════════════════════════════════════
 * Public org signup has no org context yet, so the governing policy is
 * PLATFORM-level: the designated platform org's `settings.allowUserRegistration`
 * / `settings.requireEmailVerification`. This makes `allowUserRegistration` its
 * FIRST consumer (it had zero before).
 *
 * The platform org is identified by `config.platformOrgSlug` (env
 * PLATFORM_ORG_SLUG, default 'platform'); if that slug is absent we fall back to
 * the earliest-created org. Everything resolves FAIL-CLOSED — an unresolved
 * `allowUserRegistration` is `false` (no public signup) and an unresolved
 * `requireEmailVerification` is `true` (verify before provisioning).
 */

'use strict';

const { Organization } = require('../models');

// Root platform config (env parsing lives there). Guarded so a require-time
// hiccup can never make the policy fail OPEN.
let config = {};
try {
  config = require('../../../../src/config');
} catch (_) {
  config = {};
}

/**
 * Resolve the platform-level public-signup policy, fail-closed.
 * @returns {Promise<{ allowUserRegistration: boolean, requireEmailVerification: boolean }>}
 */
async function getSignupPolicy() {
  const slug = (config && config.platformOrgSlug) || process.env.PLATFORM_ORG_SLUG || 'platform';

  let org = null;
  try {
    // Resolve ONLY the designated platform org. Do NOT fall back to an arbitrary
    // (e.g. earliest-created) tenant org — a platform-level control must never be
    // governed by a tenant's settings (confused-deputy). A missing/misconfigured
    // platform org → org stays null → hard fail-closed below.
    org = await Organization.findOne({ where: { slug } });
  } catch (_) {
    // DB unavailable / column drift — treat as no policy (fail-closed below).
    org = null;
  }

  const settings = (org && org.settings) || {};
  return {
    // Fail-closed: anything other than an explicit `true` disables signup.
    allowUserRegistration: settings.allowUserRegistration === true,
    // Fail-closed: anything other than an explicit `false` requires verification.
    requireEmailVerification: settings.requireEmailVerification !== false
  };
}

module.exports = { getSignupPolicy };
