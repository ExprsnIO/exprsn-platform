/**
 * ═══════════════════════════════════════════════════════════════════════
 * Organization provisioning engine — the compensating saga (FEAT-032 / ADR-0003)
 * ═══════════════════════════════════════════════════════════════════════
 * A composition-layer orchestrator (it owns NO domain data of its own — only the
 * `auth.provisioning_runs` ledger) that provisions an organization end-to-end
 * across auth, CA, nexus, and spark in one request-scoped, resumable call.
 *
 * Placement (ADR-0003 Decision 2): this lives at `src/provisioning/`, NOT inside
 * a domain module and NOT as a mounted registry module — it has no HTTP surface
 * of its own. Its only caller in this ticket is the existing auth route
 * POST /auth/api/organizations/provision (admin-only, CA-token gated).
 *
 * Invocation (ADR-0003 Decision 1): every cross-module call is a LAZY, in-process
 * require of the target module's PUBLISHED service façade (never HMAC-HTTP, never
 * another module's models). Requires are lazy — inside the step methods — so
 * module load order in src/index.js is unaffected and no eager cycle can form.
 * NOTHING is required at this file's top level (also keeps a bare
 * `require('./engine')` smoke-test load-safe, since @exprsn/shared eagerly builds
 * Stripe at require time).
 *
 * The saga (ADR-0003 Decision 3, followed verbatim):
 *   S0  preflight (root exists + signing key usable + system roles present) + ledger
 *   S1  auth: owner user + org + owner membership + owner UserRole + RBAC groups   [1 auth txn]
 *   S2  ca:   directory group (organizational_unit) + owner membership            [1 ca txn]
 *   S3  auth: persist the auth-org ↔ ca-group linkage (organizations.ca_group_id)  [1 row]
 *   S4  ca:   per-org intermediate CA under the single platform root               [revoke on unwind]
 *   S5  auth→ca: owner entity cert (ADR S5) + owner org-scoped token (ADR S6),
 *               THROUGH the one member-credentialing hook                          [revoke on unwind]
 *   S7  nexus: social group (gated by template.nexus.create; idempotent by slug)   [cascade-delete on unwind]
 *   S8  spark: group channel binding (findOrCreate)                                [delete on unwind]
 *   S9  finalize (ledger status='completed')  ← the post-loop markCompleted
 *
 * Idempotency: the ledger `cursor` resumes forward from the last completed step;
 * a `completed` run short-circuits. On an unrecoverable failure the ledger drives
 * LIFO compensation over the steps completed so far; a failing compensator parks
 * the run in `compensation_failed` with residual ids and never throws uncaught.
 * Certificate compensation is REVOKE, never delete (a revoked cert row is inert).
 */

'use strict';

function log(level, message, meta) {
  const line = `[provisioning] ${message}`;
  if (level === 'error') {
    console.error(line, meta !== undefined ? meta : '');
  } else {
    console.log(line, meta !== undefined ? meta : '');
  }
}

// Map a template RBAC group's ownerRole label to its org-scoped system-role slug.
function rbacRoleSlug(ownerRole) {
  if (ownerRole === 'admin') return 'org-admin';
  if (ownerRole === 'owner') return 'org-owner';
  return 'org-member';
}

/**
 * The ordered saga steps. S0 (preflight) and S9 (finalize) are handled inline in
 * the driver; the compensating steps are S1..S8. Each `run(ctx)` returns an ids
 * patch (merged into ctx.ids + the ledger); each `compensate(ctx)` undoes its own
 * step best-effort and idempotently, guarding on the ids the step recorded.
 */
const STEPS = [
  // ── S1: auth — owner user + org + owner membership + owner role + RBAC groups ──
  {
    id: 'S1',
    async run(ctx) {
      const crypto = require('crypto');
      const { sequelize, User, Group, GroupRole, Role } = require('../../services/auth/src/models');
      const organizationService = require('../../services/auth/src/services/organizationService');

      const owner = ctx.input.owner || {};
      const patch = {};

      await sequelize.transaction(async (transaction) => {
        const [ownerUser, ownerCreated] = await User.findOrCreate({
          where: { email: owner.email },
          defaults: {
            email: owner.email,
            passwordHash: owner.password || crypto.randomBytes(24).toString('base64'),
            displayName: owner.displayName || null,
            emailVerified: owner.emailVerified !== undefined ? Boolean(owner.emailVerified) : true
          },
          transaction
        });
        patch.ownerUserId = ownerUser.id;
        patch.ownerUserCreated = ownerCreated;

        // Org + owner OrganizationMember + owner org-owner UserRole (façade, joins our txn).
        const org = await organizationService.createOrganization(ctx.orgPayload, ownerUser.id, { transaction });
        patch.organizationId = org.id;

        // Default RBAC groups per template (each linked to its matching system role).
        const rbacGroupIds = [];
        for (const g of (ctx.template.rbacGroups || [])) {
          const group = await Group.create({
            organizationId: org.id,
            name: g.name,
            slug: g.slug,
            type: 'organization'
          }, { transaction });
          rbacGroupIds.push(group.id);

          const sysRole = await Role.findOne({
            where: { slug: rbacRoleSlug(g.ownerRole), type: 'system' },
            transaction
          });
          if (sysRole) {
            await GroupRole.create({
              groupId: group.id,
              roleId: sysRole.id,
              scope: 'organization',
              organizationId: org.id,
              status: 'active'
            }, { transaction });
          }
        }
        patch.rbacGroupIds = rbacGroupIds;
      });

      return patch;
    },
    async compensate(ctx) {
      const orgId = ctx.ids.organizationId;
      if (!orgId && !(ctx.ids.ownerUserCreated && ctx.ids.ownerUserId)) {
        return;
      }
      const {
        sequelize, User, Group, GroupRole, UserRole, OrganizationMember, Organization
      } = require('../../services/auth/src/models');

      await sequelize.transaction(async (transaction) => {
        if (orgId) {
          // Delete children before the org (RBAC group → role links first). UserRole
          // does NOT cascade on org delete, so remove it explicitly (ADR finding 3).
          await GroupRole.destroy({ where: { organizationId: orgId }, transaction });
          await Group.destroy({ where: { organizationId: orgId }, transaction });
          await UserRole.destroy({ where: { organizationId: orgId, scope: 'organization' }, transaction });
          await OrganizationMember.destroy({ where: { organizationId: orgId }, transaction });
          // Hard-delete (paranoid model) so the unique slug is freed for a retry.
          await Organization.destroy({ where: { id: orgId }, force: true, transaction });
        }
        if (ctx.ids.ownerUserCreated && ctx.ids.ownerUserId) {
          await User.destroy({ where: { id: ctx.ids.ownerUserId }, force: true, transaction });
        }
      });
    }
  },

  // ── S2: ca — directory group + owner membership (auth user id) ────────────────
  {
    id: 'S2',
    async run(ctx) {
      const caDirectory = require('../../services/ca/services/directory');
      const { group, created } = await caDirectory.ensureOrgDirectoryGroup({
        name: ctx.orgPayload.name,
        slug: ctx.orgPayload.slug,
        description: (ctx.input.organization && ctx.input.organization.description) || null
      });
      await caDirectory.addOrgGroupMember(ctx.ids.ownerUserId, group.id, 'owner');
      return { caGroupId: group.id, caGroupCreated: created };
    },
    async compensate(ctx) {
      if (!ctx.ids.caGroupId) {
        return;
      }
      const caDirectory = require('../../services/ca/services/directory');
      await caDirectory.removeOrgGroupMember(ctx.ids.ownerUserId, ctx.ids.caGroupId);
      // Delete the group only if THIS run created it (ADR S2 compensation).
      if (ctx.ids.caGroupCreated) {
        await caDirectory.deleteOrgDirectoryGroup(ctx.ids.caGroupId);
      }
    }
  },

  // ── S3: auth — persist the auth-org ↔ ca-group linkage ────────────────────────
  {
    id: 'S3',
    async run(ctx) {
      const { Organization } = require('../../services/auth/src/models');
      await Organization.update(
        { caGroupId: ctx.ids.caGroupId },
        { where: { id: ctx.ids.organizationId } }
      );
      return {};
    },
    async compensate(ctx) {
      // Subsumed by S1's org hard-delete on a full unwind; explicit + null-safe for
      // any partial path where the org row still exists.
      if (!ctx.ids.organizationId) {
        return;
      }
      try {
        const { Organization } = require('../../services/auth/src/models');
        await Organization.update({ caGroupId: null }, { where: { id: ctx.ids.organizationId } });
      } catch (_) { /* org already gone — nothing to unlink */ }
    }
  },

  // ── S4: ca — per-org intermediate CA under the single platform root ───────────
  {
    id: 'S4',
    async run(ctx) {
      const certificateService = require('../../services/ca/services/certificate');
      // Dedup: reuse an existing active intermediate for this org (organizationalUnit).
      const existing = await certificateService.findActiveOrgIntermediate(ctx.ids.organizationId);
      if (existing) {
        return { intermediateCertId: existing.id };
      }
      const intermediate = await certificateService.createIntermediateCertificate({
        rootCertificateId: ctx.ids.platformRootId,
        commonName: `Org ${ctx.orgPayload.name} Intermediate CA`,
        organization: ctx.orgPayload.name,
        organizationalUnit: ctx.ids.organizationId,
        validityYears: (ctx.template.cert && ctx.template.cert.intermediateValidityYears) || 5
      }, null); // system-owned (userId null) per ADR topology
      return { intermediateCertId: intermediate.id };
    },
    async compensate(ctx) {
      if (!ctx.ids.intermediateCertId) {
        return;
      }
      const certificateService = require('../../services/ca/services/certificate');
      // REVOKE, never delete (ADR-0003 Decision 3). Already-revoked is a no-op.
      try {
        await certificateService.revokeCertificate(ctx.ids.intermediateCertId, 'provisioning-rollback', null);
      } catch (e) {
        if (!/already revoked/i.test(e.message || '')) {
          throw e;
        }
      }
    }
  },

  // ── S5: auth→ca — owner entity cert (ADR S5) + org-scoped token (ADR S6) ───────
  //       through the ONE member-credentialing hook (the owner is the first member).
  {
    id: 'S5',
    async run(ctx) {
      const memberHook = require('../../services/auth/src/services/memberProvisioningService');
      const result = await memberHook.provisionMemberCredentials(
        ctx.ids.organizationId,
        ctx.ids.ownerUserId,
        'owner',
        {
          idempotencyKey: `${ctx.input.idempotencyKey}:owner`,
          caGroupId: ctx.ids.caGroupId,
          intermediateCertId: ctx.ids.intermediateCertId,
          template: ctx.template
        }
      );
      return {
        ownerCertId: result.certId,
        ownerTokenId: result.tokenId,
        ownerUserRoleId: result.userRoleId || null
      };
    },
    async compensate(ctx) {
      // Revoke token then cert (LIFO within the step). The hook self-compensates a
      // token-after-cert failure, so on a hook throw ctx.ids has neither id and this
      // is a no-op; it only fires when a LATER step (S7/S8) failed.
      if (ctx.ids.ownerTokenId) {
        try {
          const caTokenService = require('../../services/ca/services/token');
          await caTokenService.revokeToken(ctx.ids.ownerTokenId, 'provisioning-rollback', null, { isAdmin: true });
        } catch (_) { /* best-effort */ }
      }
      if (ctx.ids.ownerCertId) {
        const certificateService = require('../../services/ca/services/certificate');
        try {
          await certificateService.revokeCertificate(ctx.ids.ownerCertId, 'provisioning-rollback', null);
        } catch (e) {
          if (!/already revoked/i.test(e.message || '')) {
            throw e;
          }
        }
      }
    }
  },

  // ── S7: nexus — social group (gated by template.nexus.create) ─────────────────
  {
    id: 'S7',
    async run(ctx) {
      if (!ctx.template.nexus || !ctx.template.nexus.create) {
        return {};
      }
      const groupService = require('../../services/nexus/src/services/groupService');
      // Idempotent by deterministic slug derived from the org id.
      const group = await groupService.createGroup(
        ctx.ids.ownerUserId,
        {
          name: ctx.orgPayload.name,
          description: (ctx.input.organization && ctx.input.organization.description) || null,
          visibility: ctx.template.nexus.visibility || 'private',
          joinMode: ctx.template.nexus.joinMode || 'request'
        },
        { slug: `org-${ctx.ids.organizationId}` }
      );
      return { nexusGroupId: group.id };
    },
    async compensate(ctx) {
      if (!ctx.ids.nexusGroupId) {
        return;
      }
      const groupService = require('../../services/nexus/src/services/groupService');
      await groupService.deleteGroupCascade(ctx.ids.nexusGroupId);
    }
  },

  // ── S8: spark — group channel binding (findOrCreate, idempotent) ──────────────
  {
    id: 'S8',
    async run(ctx) {
      if (!ctx.ids.nexusGroupId) {
        return {};
      }
      const groupChannelService = require('../../services/spark/src/services/groupChannelService');
      const channels = await groupChannelService.ensureGroupChannels(ctx.ids.nexusGroupId, ctx.ids.ownerUserId);
      return {
        sparkChatConversationId: channels.chat && channels.chat.id,
        sparkAnnouncementConversationId: channels.announcement && channels.announcement.id
      };
    },
    async compensate(ctx) {
      if (!ctx.ids.nexusGroupId) {
        return;
      }
      const groupChannelService = require('../../services/spark/src/services/groupChannelService');
      await groupChannelService.deleteGroupChannels(ctx.ids.nexusGroupId);
    }
  }
];

const STEP_IDS = STEPS.map((s) => s.id);

function isDone(cursor, stepId) {
  if (!cursor) {
    return false;
  }
  return STEP_IDS.indexOf(stepId) <= STEP_IDS.indexOf(cursor);
}

function meaningfulIds(ctx) {
  const ids = ctx.ids || {};
  return {
    organizationId: ids.organizationId || null,
    caGroupId: ids.caGroupId || null,
    caGroupCreated: !!ids.caGroupCreated,
    intermediateCertId: ids.intermediateCertId || null,
    ownerUserId: ids.ownerUserId || null,
    ownerUserCreated: !!ids.ownerUserCreated,
    ownerUserRoleId: ids.ownerUserRoleId || null,
    ownerCertId: ids.ownerCertId || null,
    ownerTokenId: ids.ownerTokenId || null,
    rbacGroupIds: ids.rbacGroupIds || [],
    nexusGroupId: ids.nexusGroupId || null,
    sparkChatConversationId: ids.sparkChatConversationId || null,
    sparkAnnouncementConversationId: ids.sparkAnnouncementConversationId || null
  };
}

function buildResult(ctx, status, error) {
  const ids = meaningfulIds(ctx);
  return {
    runId: ctx.run.id,
    status,
    organizationId: ids.organizationId,
    caGroupId: ids.caGroupId,
    intermediateCertId: ids.intermediateCertId,
    ownerUserId: ids.ownerUserId,
    ownerUserCreated: ids.ownerUserCreated,
    ownerCertId: ids.ownerCertId,
    ownerTokenId: ids.ownerTokenId,
    nexusGroupId: ids.nexusGroupId,
    ...(error ? { error } : {})
  };
}

/**
 * LIFO compensation over the steps completed before `failedStepId`. Best-effort:
 * a failing compensator is logged and parks the run in `compensation_failed` with
 * residual ids; it never throws out of here.
 */
async function runCompensation(ctx, failedStepId) {
  const ledger = require('./ledger');
  const failedIdx = STEP_IDS.indexOf(failedStepId);
  const residual = {};
  let compError = null;

  for (let i = failedIdx - 1; i >= 0; i -= 1) {
    const step = STEPS[i];
    if (!step.compensate) {
      continue;
    }
    try {
      await step.compensate(ctx);
    } catch (e) {
      compError = e;
      residual[`${step.id}CompensationError`] = e.message;
      log('error', `compensation failed at ${step.id}: ${e.message}`);
    }
  }

  if (compError) {
    await ledger.markCompensationFailed(ctx.run, residual, compError);
    return 'compensation_failed';
  }
  return 'failed';
}

/**
 * Provision an organization end-to-end (the saga entry point).
 *
 * @param {Object} input
 * @param {string} input.idempotencyKey   - required; a stable per-org key (the route derives it from the slug)
 * @param {string} input.type             - 'enterprise' | 'team' | 'personal' (selects the template)
 * @param {Object} input.organization     - { name, slug?, description?, email?, website? } (allowlisted)
 * @param {Object} input.owner            - { email, displayName?, password?, emailVerified?=true }
 * @param {Object} [input.actor]          - { userId?, isAdmin? } (audit only)
 * @returns {Promise<Object>} {
 *   runId, status: 'completed'|'failed'|'compensation_failed',
 *   organizationId, caGroupId, intermediateCertId,
 *   ownerUserId, ownerUserCreated, ownerCertId, ownerTokenId, nexusGroupId,
 *   error?: { step, code, message }
 * }
 */
async function provisionOrganization(input) {
  // Lazy — @exprsn/shared eagerly builds Stripe at require time; keep it out of
  // this module's top-level load path.
  const { AppError } = require('@exprsn/shared');
  const templates = require('./templates');
  const ledger = require('./ledger');

  if (!input || typeof input.idempotencyKey !== 'string' || !input.idempotencyKey.trim()) {
    throw new AppError('idempotencyKey is required', 400, 'VALIDATION_ERROR');
  }
  if (!input.owner || !input.owner.email) {
    throw new AppError('owner.email is required', 400, 'VALIDATION_ERROR');
  }

  const template = templates.resolveTemplate(input.type);
  // buildOrgPayload is the mass-assignment guard: type/plan/settings come from the
  // template, never the client body; it also validates the name + normalizes slug.
  const orgPayload = templates.buildOrgPayload(template, input.organization || {});

  // ── S0 preflight (read-only; aborts before any provisioning write) ────────────
  const certificateService = require('../../services/ca/services/certificate');
  const root = await certificateService.findActiveRoot();
  if (!root) {
    throw new AppError('No active platform root CA; cannot provision an organization', 409, 'NO_PLATFORM_ROOT');
  }
  const keyUsable = await certificateService.hasUsableSigningKey(root.id);
  if (!keyUsable) {
    throw new AppError('Platform root CA signing key is unavailable (check STORAGE_TYPE)', 409, 'CA_KEY_STORAGE_UNAVAILABLE');
  }

  const { Role } = require('../../services/auth/src/models');
  const systemRoles = await Role.findAll({
    where: { slug: ['org-owner', 'org-admin', 'org-member'], type: 'system' }
  });
  if (systemRoles.length < 3) {
    throw new AppError('System organization roles (org-owner/org-admin/org-member) are missing', 409, 'SYSTEM_ROLES_MISSING');
  }

  // Ledger: short-circuit / retry semantics (ADR-0003 RC-2).
  //  - completed            → reuse the finished run (idempotent success).
  //  - compensation_failed  → parked; needs an admin. Do NOT resume forward onto
  //                           residual/destroyed state — return the parked result.
  //  - failed               → a prior attempt failed and unwound cleanly. RESET so
  //                           this retry re-runs S1.. from a clean slate rather than
  //                           skipping the rolled-back steps onto deleted ids.
  //  - in_progress          → genuine mid-flight interruption: resume from cursor.
  const { run } = await ledger.findOrCreateRun({ idempotencyKey: input.idempotencyKey, kind: 'org' });

  if (run.status === 'completed') {
    return buildResult({ run, ids: { ...(run.ids || {}) } }, 'completed');
  }
  if (run.status === 'compensation_failed') {
    return buildResult({ run, ids: { ...(run.ids || {}) } }, 'compensation_failed', run.error || undefined);
  }
  if (run.status === 'failed') {
    await ledger.resetForRetry(run);
  }

  const ctx = {
    input,
    template,
    orgPayload,
    run,
    actor: input.actor || {},
    ids: { ...(run.ids || {}), platformRootId: root.id }
  };

  log('info', `provisioning org "${orgPayload.slug}" (type=${template.orgType}, run=${run.id}, cursor=${run.cursor || 'none'})`);

  for (const step of STEPS) {
    if (isDone(ctx.run.cursor, step.id)) {
      continue;
    }
    try {
      const patch = (await step.run(ctx)) || {};
      ctx.ids = { ...ctx.ids, ...patch };
      await ledger.advance(ctx.run, step.id, patch);
    } catch (err) {
      const error = { step: step.id, code: err.code || 'STEP_FAILED', message: err.message };
      log('error', `step ${step.id} failed: ${err.message}`);
      await ledger.markFailed(ctx.run, error);
      const status = await runCompensation(ctx, step.id);
      return buildResult(ctx, status, error);
    }
  }

  // S9 — finalize.
  await ledger.markCompleted(ctx.run, meaningfulIds(ctx));
  log('info', `provisioned org ${ctx.ids.organizationId} (run=${run.id})`);
  return buildResult(ctx, 'completed');
}

module.exports = { provisionOrganization };
