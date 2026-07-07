/**
 * ═══════════════════════════════════════════════════════════
 * MFA Policy Service
 * Resolves the effective per-org 2FA policy for a user and turns it into a
 * concrete login-time enrollment decision.
 *
 * Org admins configure the policy in the "Auth & Identity" console
 * (persisted on `Organization.settings.requireMfa` + `settings.mfa.*` via
 * `PATCH /auth/api/organizations/:id`). This service is what makes that policy
 * ACTUALLY enforced at login (STATUS.md #12) rather than saved-but-inert.
 *
 * Enforcement model:
 *  - A user's effective policy is the MOST RESTRICTIVE across every org they are
 *    an active member of OR own: required if ANY such org requires MFA; grace =
 *    the smallest grace window; allowedMethods = the intersection.
 *  - The enrollment grace window is anchored on the user's account creation date
 *    (`user.createdAt`). We do not persist a "policy effective date", so enabling
 *    the policy on an org means existing members (whose accounts predate the
 *    grace window) must enroll on their next login — the intended, secure default
 *    for "require 2FA". Anchoring on a policy-effective timestamp is a future
 *    refinement.
 *  - Only `totp` + `backup_codes` are implemented today; `sms`/`email`/`webauthn`
 *    are config scaffolding. `allowedMethods` is therefore floored to the
 *    implemented set so a policy can never lock a user out of enrollment.
 * ═══════════════════════════════════════════════════════════
 */

const { logger } = require('@exprsn/shared');
const { Organization, OrganizationMember } = require('../models');

const DAY_MS = 24 * 60 * 60 * 1000;

// Methods with a working end-to-end enrollment/verification path.
const IMPLEMENTED_METHODS = ['totp', 'backup_codes'];

/**
 * Gather every active org the user belongs to (active membership) or owns.
 * @returns {Promise<Array<Organization>>}
 */
async function collectUserOrgs(user) {
  const userId = user.id;

  const [memberships, owned] = await Promise.all([
    OrganizationMember.findAll({
      where: { userId, status: 'active' },
      include: [{
        model: Organization,
        as: 'organization',
        required: true,
        where: { status: 'active' },
      }],
    }),
    Organization.findAll({ where: { ownerId: userId, status: 'active' } }),
  ]);

  const orgs = new Map();
  for (const m of memberships) {
    if (m.organization) orgs.set(m.organization.id, m.organization);
  }
  for (const o of owned) orgs.set(o.id, o);
  return [...orgs.values()];
}

/**
 * Resolve the effective MFA policy across the user's orgs.
 * @returns {Promise<{ required: boolean, allowedMethods: string[],
 *   gracePeriodDays: number, rememberDeviceDays: number }>}
 */
async function resolveMfaPolicy(user) {
  const orgs = await collectUserOrgs(user);
  const requiring = orgs.filter((o) => o.settings && o.settings.requireMfa === true);

  if (requiring.length === 0) {
    return {
      required: false,
      allowedMethods: [...IMPLEMENTED_METHODS],
      gracePeriodDays: 0,
      rememberDeviceDays: 0,
    };
  }

  let gracePeriodDays = Infinity;
  let rememberDeviceDays = Infinity;
  let allowed = null; // Set, built as the intersection across requiring orgs

  for (const o of requiring) {
    const mfa = (o.settings && o.settings.mfa) || {};

    const grace = Number.isFinite(mfa.enrollmentGracePeriodDays) ? mfa.enrollmentGracePeriodDays : 0;
    gracePeriodDays = Math.min(gracePeriodDays, Math.max(0, grace));

    const remember = Number.isFinite(mfa.rememberDeviceDays) ? mfa.rememberDeviceDays : 0;
    rememberDeviceDays = Math.min(rememberDeviceDays, Math.max(0, remember));

    const methods = Array.isArray(mfa.allowedMethods) && mfa.allowedMethods.length
      ? mfa.allowedMethods
      : [...IMPLEMENTED_METHODS];
    allowed = allowed === null
      ? new Set(methods)
      : new Set(methods.filter((m) => allowed.has(m)));
  }

  // Keep allowedMethods RAW (the intersection) so an org that restricts to a
  // specific method is honoured — but track whether an *enrollable* method
  // (TOTP, the only one implemented) is actually permitted. Enforcement only
  // hard-gates when it is, so a policy that permits only unbuilt methods
  // (sms/email/webauthn) can't trap the user out of logging in.
  const allowedMethods = [...(allowed || new Set(IMPLEMENTED_METHODS))];
  const totpAllowed = allowedMethods.includes('totp');
  if (!totpAllowed) {
    logger.warn('Org MFA policy permits no implemented method (TOTP disallowed); enrollment cannot be enforced', { userId: user.id, allowedMethods });
  }

  return {
    required: true,
    allowedMethods,
    totpAllowed,
    gracePeriodDays: gracePeriodDays === Infinity ? 0 : gracePeriodDays,
    rememberDeviceDays: rememberDeviceDays === Infinity ? 0 : rememberDeviceDays,
  };
}

/**
 * Given a resolved policy, decide what a NOT-yet-enrolled user must do.
 * @param {object} user  Sequelize user (needs `createdAt`)
 * @param {object} policy  output of resolveMfaPolicy
 * @returns {{ enrollmentRequired: boolean, graceExpired: boolean,
 *   graceEndsAt: number|null, allowedMethods: string[] }}
 */
function evaluateEnrollment(user, policy) {
  if (!policy.required) {
    return { enrollmentRequired: false, graceExpired: false, graceEndsAt: null, allowedMethods: policy.allowedMethods };
  }
  const created = new Date(user.createdAt || Date.now()).getTime();
  const graceEndsAt = created + policy.gracePeriodDays * DAY_MS;
  // Only treat the window as "expired" (i.e. hard-gate) when an enrollable
  // method exists; otherwise there is nothing the user could set up.
  const graceExpired = policy.totpAllowed && Date.now() >= graceEndsAt;
  return {
    enrollmentRequired: true,
    graceExpired,
    graceEndsAt,
    allowedMethods: policy.allowedMethods,
  };
}

/**
 * Convenience: resolve policy + evaluate enrollment for a not-enrolled user in
 * one call. Returns `{ required:false }` fast when the user already has MFA on.
 */
async function evaluateForLogin(user) {
  if (user.mfaEnabled) {
    return { required: false, enrolled: true };
  }
  const policy = await resolveMfaPolicy(user);
  const evaluation = evaluateEnrollment(user, policy);
  return { ...evaluation, required: policy.required, policy };
}

module.exports = {
  IMPLEMENTED_METHODS,
  collectUserOrgs,
  resolveMfaPolicy,
  evaluateEnrollment,
  evaluateForLogin,
};
