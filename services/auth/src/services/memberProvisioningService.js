/**
 * ═══════════════════════════════════════════════════════════════════════
 * Member provisioning hook (FEAT-032 / ADR-0003 Decision 2b)
 * ═══════════════════════════════════════════════════════════════════════
 * The ONE per-member credentialing path. Both the org-provisioning engine (for
 * the owner — the owner is simply the org's first member) and FEAT-035 user
 * import call this hook, so member credentialing lives in exactly one place and
 * auth never has to require the composition-layer engine (`src/provisioning/`).
 *
 * It performs the member subset of the saga:
 *   • S1-membership — reactivate-or-create the OrganizationMember with the
 *     CORRECT role and grant the MATCHING org-scoped UserRole
 *     (owner→org-owner / admin→org-admin / member→org-member). This fixes the
 *     `addMember` always-'org-member' bug for this path. One auth transaction.
 *   • S5 — the member's entity certificate under the org's intermediate CA.
 *   • S6 — the member's org-scoped CA token (organizationId = the org's caGroupId).
 *
 * Idempotency + rollback: a per-member ledger row keyed (idempotencyKey, userId)
 * in auth.provisioning_runs records the created ids; a completed run
 * short-circuits, a partial run resumes forward. If the token step (S6) fails
 * after the cert (S5) is minted, the hook REVOKES that cert before rethrowing so
 * it never leaks a live-but-unlinked credential (certificate compensation is
 * revoke, never delete — ADR-0003 Decision 3).
 *
 * Cross-module (CA) calls are lazy in-process requires of the CA's published
 * service façades over the already-established auth→CA edge (finding 7 /
 * tokenService.js), never HMAC-HTTP and never ca.models.
 */

const { AppError } = require('@exprsn/shared');

// Map the caller's member role to its org-scoped system-role slug.
function roleToSystemSlug(role) {
  if (role === 'owner') return 'org-owner';
  if (role === 'admin') return 'org-admin';
  if (role === 'member') return 'org-member';
  // 'guest' (and any unknown role) → org membership only, NO elevated org-scoped
  // system role. The caller still records the OrganizationMember.role verbatim;
  // returning null makes the hook skip the UserRole grant (least privilege).
  return null;
}

// Sensible defaults so a FEAT-035 caller may omit the template.
const DEFAULT_TOKEN_PERMISSIONS = { read: true, write: true, append: true, update: true, delete: false };
const DEFAULT_TOKEN_EXPIRY_SECONDS = 2592000; // 30d
const DEFAULT_ENTITY_VALIDITY_DAYS = 365;

async function persistLedger(run, patch) {
  run.ids = { ...(run.ids || {}), ...patch };
  run.changed('ids', true);
  await run.save();
}

/**
 * Provision a member's credentials (membership + entity cert + org-scoped token).
 *
 * @param {string} orgId - auth organization id
 * @param {string} userId - auth user id being credentialed
 * @param {string} [role='member'] - 'owner' | 'admin' | 'member'
 * @param {Object} [opts]
 * @param {string} [opts.idempotencyKey] - stable per-member key (defaults to `member:<orgId>:<userId>`)
 * @param {string} [opts.caGroupId] - the org's ca.groups id (else read from the org row)
 * @param {string} [opts.intermediateCertId] - the org's intermediate CA id (else resolved by orgId)
 * @param {Object} [opts.template] - a provisioning template (cert/token config); optional
 * @returns {Promise<{ membership: Object|null, userRoleId: string|null, certId: string, tokenId: string, reused?: boolean }>}
 */
async function provisionMemberCredentials(orgId, userId, role = 'member', opts = {}) {
  const {
    sequelize,
    Organization,
    OrganizationMember,
    Role,
    UserRole,
    User,
    ProvisioningRun
  } = require('../models');
  const certificateService = require('../../../ca/services/certificate');
  const caTokenService = require('../../../ca/services/token');
  const platformSigning = require('../../../ca/services/platformSigning');

  const org = await Organization.findByPk(orgId);
  if (!org) {
    throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
  }
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const template = opts.template || {};
  const certCfg = template.cert || {};
  const tokenCfg = template.token || {};
  const caGroupId = opts.caGroupId || org.caGroupId || null;
  const roleSlug = roleToSystemSlug(role);
  const idempotencyKey = opts.idempotencyKey || `member:${orgId}:${userId}`;

  // ── Per-member ledger row (idempotency). Completed → short-circuit. ──────────
  const [run] = await ProvisioningRun.findOrCreate({
    where: { idempotencyKey, userId, kind: 'member' },
    defaults: {
      idempotencyKey,
      userId,
      kind: 'member',
      organizationId: orgId,
      status: 'in_progress',
      ids: {}
    }
  });
  if (run.status === 'completed') {
    return {
      membership: null,
      userRoleId: run.ids.userRoleId || null,
      certId: run.ids.certId,
      tokenId: run.ids.tokenId,
      reused: true
    };
  }
  const ids = { ...(run.ids || {}) };

  // ── S1-membership: reactivate-or-create membership + matching UserRole ───────
  const membership = await sequelize.transaction(async (transaction) => {
    const existing = await OrganizationMember.findOne({
      where: { organizationId: orgId, userId },
      transaction
    });

    let member;
    if (existing) {
      existing.status = 'active';
      existing.role = role;
      await existing.save({ transaction });
      member = existing;
    } else {
      member = await OrganizationMember.create(
        { organizationId: orgId, userId, role, status: 'active' },
        { transaction }
      );
    }

    // Grant the MATCHING org-scoped system role (the addMember bug fix).
    const systemRole = await Role.findOne({
      where: { slug: roleSlug, type: 'system' },
      transaction
    });
    if (systemRole) {
      const [userRole] = await UserRole.findOrCreate({
        where: { userId, roleId: systemRole.id, scope: 'organization', organizationId: orgId },
        defaults: {
          userId,
          roleId: systemRole.id,
          scope: 'organization',
          organizationId: orgId,
          status: 'active'
        },
        transaction
      });
      if (userRole.status !== 'active') {
        userRole.status = 'active';
        await userRole.save({ transaction });
      }
      ids.userRoleId = userRole.id;
    }

    return member;
  });
  await persistLedger(run, ids);

  // ── Resolve the org's intermediate CA (S5 prep) ─────────────────────────────
  let intermediateCertId = opts.intermediateCertId || ids.intermediateCertId;
  if (!intermediateCertId) {
    const intermediate = await certificateService.findActiveOrgIntermediate(orgId);
    if (!intermediate) {
      throw new AppError(
        'Organization intermediate CA not found; provision the organization first',
        409,
        'ORG_INTERMEDIATE_MISSING'
      );
    }
    intermediateCertId = intermediate.id;
  }
  ids.intermediateCertId = intermediateCertId;

  // ── S5: entity cert under the org intermediate (reuse if already minted) ─────
  let certId = ids.certId;
  if (!certId) {
    const { certificate } = await certificateService.createEntityCertificate(
      {
        issuerId: intermediateCertId,
        commonName: user.email,
        email: user.email,
        organization: org.name,
        organizationalUnit: orgId,
        type: certCfg.entityType || 'client',
        validityDays: certCfg.entityValidityDays || DEFAULT_ENTITY_VALIDITY_DAYS
      },
      null // system-owned issuance (Certificate.userId nullable)
    );
    certId = certificate.id;
    ids.certId = certId;
    await persistLedger(run, ids);
  }

  // ── S6: org-scoped token (revoke the S5 cert on failure — self-compensation) ─
  let tokenId = ids.tokenId;
  if (!tokenId) {
    try {
      const signingCertId = await platformSigning.getSigningCertificateId();
      const params = {
        certificateId: signingCertId,
        permissions: tokenCfg.permissions || DEFAULT_TOKEN_PERMISSIONS,
        resourceType: tokenCfg.resourceType || 'url',
        resourceValue: tokenCfg.resourceValue || '/',
        expiryType: tokenCfg.expiryType || 'time',
        expirySeconds: tokenCfg.expirySeconds || DEFAULT_TOKEN_EXPIRY_SECONDS,
        data: { userId, email: user.email, roles: [roleSlug] }
      };
      // Scope the token to the org's CA directory group (token-spec v1.1).
      if (caGroupId) {
        params.organizationId = caGroupId;
      }
      const token = await caTokenService.generateToken(params, userId, { isAdmin: true });
      tokenId = token.id;
      ids.tokenId = tokenId;
      await persistLedger(run, ids);
    } catch (tokenError) {
      // Self-compensation: never leave a live entity cert with no token behind it.
      try {
        await certificateService.revokeCertificate(certId, 'provisioning-rollback', null);
        // The cert is now revoked (inert). Drop it from the ledger so a resumed
        // run (e.g. a FEAT-035 re-import with the same member key) re-mints a
        // fresh entity cert instead of reusing a revoked, non-validating one.
        delete ids.certId;
        certId = null;
      } catch (revokeError) {
        // Best-effort: a failed revoke must not mask the original error.
        run.error = {
          step: 'S6',
          code: tokenError.code || 'TOKEN_FAILED',
          message: tokenError.message,
          compensation: `cert revoke failed: ${revokeError.message}`
        };
      }
      run.status = 'failed';
      if (!run.error) {
        run.error = { step: 'S6', code: tokenError.code || 'TOKEN_FAILED', message: tokenError.message };
      }
      run.ids = { ...ids };
      run.changed('ids', true);
      await run.save();
      throw tokenError;
    }
  }

  run.status = 'completed';
  run.ids = { ...ids };
  run.changed('ids', true);
  await run.save();

  return { membership, userRoleId: ids.userRoleId || null, certId, tokenId };
}

module.exports = { provisionMemberCredentials, roleToSystemSlug };
