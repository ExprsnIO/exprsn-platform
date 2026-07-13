/**
 * ═══════════════════════════════════════════════════════════════════════
 * User Import Service (FEAT-035 slice A)
 * ═══════════════════════════════════════════════════════════════════════
 * Server-side, streamed CSV bulk-user import core. Split out of routes so the
 * parse → validate → persist pipeline is unit-testable without HTTP and so the
 * Bull-queue seam (slice B) is a single branch in the route handler.
 *
 * Pieces (all exported for tests):
 *   • parseCsvBuffer(buffer)      — streamed, byte-capped-upstream, row-capped
 *                                   RFC-4180 parse → array of header-keyed rows.
 *   • resolveImportContext(input) — THE server-side authz boundary. Decides the
 *                                   target org, whether the actor is a platform
 *                                   super-admin, the actor's org rank, and the
 *                                   owner-import allowance. Throws before any row
 *                                   is written on an inadmissible request.
 *   • runImport(rows, ctx)        — per-row loop (independent, no transaction,
 *                                   each in its own try/catch). Returns the
 *                                   extended report.
 *   • validateRow / rankOf / MAX_IMPORT_ROWS — helpers + the sync cap constant.
 *
 * ── Security / policy (server-enforced, never trusts a client flag) ──────────
 *   AUTHZ boundary (resolveImportContext):
 *     - Platform super-admin (PLATFORM_ADMIN_EMAILS allowlist OR a DB
 *       admin/system_admin role): may import into ANY org (or no org) and assign
 *       any role — subject only to the owner policy below.
 *     - A non-platform org admin: `organizationId` is REQUIRED and the actor must
 *       be owner/admin of THAT org (organizationService.isOwnerOrAdmin) or the
 *       whole request is 403 ORG_FORBIDDEN. Per-row ROLE CEILING: a row's role may
 *       not exceed the actor's own org rank (owner>admin>member>guest); an org
 *       admin may assign up to and including their own rank, never above.
 *   OWNER-IMPORT policy (runImport):
 *     - 'owner' rows are REJECTED for org admins ALWAYS. For a platform admin they
 *       are allowed ONLY behind an explicit allowOwner flag, and even then set
 *       ONLY the OrganizationMember.role — NEVER Organization.ownerId (ownership
 *       transfer is organizationService.transferOwnership's job, not import).
 *
 * ── Deferred, flag/field-gated seams (dark in slice A, contract-final now) ────
 *   • mode='invite'      — creates the user status:'inactive' + an activation
 *                          token (inviteService.createInvite kind:'activation') +
 *                          activation email; membership/credentials defer to accept.
 *   • provisionCredentials=true — best-effort per-member cert/token via
 *                          memberProvisioningService.provisionMemberCredentials
 *                          (create mode only; requires a target org).
 *   • nexus_group column — parsed, validated, echoed; only assigned when
 *                          USER_IMPORT_NEXUS_ASSIGN=true (lazy nexus require).
 *                          Inert until FEAT-032 provides the org→nexus-group link.
 */

const crypto = require('crypto');
const { parse } = require('csv-parse');
const { AppError } = require('@exprsn/shared');
const { isPlatformAdmin } = require('@exprsn/shared/utils/platformAdmin');
const organizationService = require('./organizationService');
const { hasAdminRole } = require('../middleware/requireAdmin');

// SYNC cap. FEAT-035 slice B: rows > this are enqueued (Bull) instead of 413'd.
// The route handler's single `rows.length > MAX_IMPORT_ROWS` branch is the whole
// queue seam — runImport lifts verbatim into a future Bull processor.
const MAX_IMPORT_ROWS = 2000;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const VALID_STATUS = new Set(['active', 'inactive', 'suspended']);
const VALID_ROLES = new Set(['owner', 'admin', 'member', 'guest']);

// Org-rank ladder for the per-row ceiling. Higher = more privileged.
const RANK = { owner: 3, admin: 2, member: 1, guest: 0 };
function rankOf(role) {
  return Object.prototype.hasOwnProperty.call(RANK, role) ? RANK[role] : -1;
}

function nexusAssignEnabled() {
  return String(process.env.USER_IMPORT_NEXUS_ASSIGN || '').toLowerCase() === 'true';
}

/**
 * Parse a CSV buffer into header-keyed row objects, streamed through csv-parse.
 * Headers are normalized to snake_case lower (so "First Name" → first_name). The
 * byte ceiling is enforced UPSTREAM by multer (8MB); here we cap ROWS at
 * MAX_IMPORT_ROWS+1 so the caller can detect overflow and 413. Any parser error
 * (e.g. an unterminated quote) surfaces as AppError 400 IMPORT_PARSE_ERROR.
 *
 * @param {Buffer} buffer
 * @returns {Promise<Array<Object>>}
 */
function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const out = [];
    const parser = parse({
      columns: (header) => header.map((c) => String(c).trim().toLowerCase().replace(/\s+/g, '_')),
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
      to: MAX_IMPORT_ROWS + 1 // one past the cap → overflow is detectable
    });
    parser.on('readable', () => {
      let record;
      while ((record = parser.read()) !== null) {
        out.push(record);
      }
    });
    parser.on('error', (err) => {
      reject(new AppError(`CSV parse error: ${err.message}`, 400, 'IMPORT_PARSE_ERROR'));
    });
    parser.on('end', () => resolve(out));
    parser.write(buffer || Buffer.alloc(0));
    parser.end();
  });
}

/**
 * Resolve + authorize the import context BEFORE any row is written.
 *
 * @param {Object} input
 * @param {string}  input.actorUserId          - CA-token user id (req.userId)
 * @param {string} [input.actorEmail]          - CA-token email (req.tokenData.email)
 * @param {string} [input.organizationId]      - target org (multipart text field)
 * @param {string} [input.defaultRole]         - fallback per-row role
 * @param {string} [input.mode]                - 'create' (default) | 'invite'
 * @param {boolean}[input.provisionCredentials]- request per-member credentialing
 * @param {boolean}[input.allowOwner]          - platform-admin owner override
 * @returns {Promise<Object>} ctx consumed by runImport
 */
async function resolveImportContext(input = {}) {
  const {
    actorUserId = null,
    actorEmail = null,
    organizationId = null,
    defaultRole = 'member',
    mode = 'create',
    provisionCredentials = false,
    allowOwner = false
  } = input;

  const normalizedMode = mode === 'invite' ? 'invite' : 'create';
  const targetOrgId = organizationId ? String(organizationId) : null;

  const resolvedDefaultRole = VALID_ROLES.has(defaultRole) ? defaultRole : 'member';

  // Platform super-admin = allowlist email OR a DB admin/system_admin role.
  const actorIsPlatformAdmin =
    isPlatformAdmin(actorEmail) || (await hasAdminRole(actorUserId));

  let actorOrgRole = null;
  if (actorIsPlatformAdmin) {
    // Unlimited rank; owner is still separately gated by the owner policy.
    actorOrgRole = 'owner';
  } else {
    // Org admin path: org is required and the actor must own/admin THAT org.
    if (!targetOrgId) {
      throw new AppError(
        'organizationId is required for organization administrators',
        400,
        'ORG_REQUIRED'
      );
    }
    const authorized = await organizationService.isOwnerOrAdmin(targetOrgId, actorUserId);
    if (!authorized) {
      throw new AppError('Not an admin of the target organization', 403, 'ORG_FORBIDDEN');
    }
    // The actor's own rank sets the per-row ceiling.
    const { OrganizationMember } = require('../models');
    const member = await OrganizationMember.findOne({
      where: { organizationId: targetOrgId, userId: actorUserId, status: 'active' }
    });
    actorOrgRole = member ? member.role : null;
  }

  // Credentialing is org-scoped — it cannot run without a target org.
  if (provisionCredentials && !targetOrgId) {
    throw new AppError(
      'provisionCredentials requires an organizationId',
      400,
      'ORG_REQUIRED'
    );
  }
  // Invite mode defers all credentialing to invite acceptance, so
  // provisionCredentials would be silently ignored — reject the ambiguous combo
  // rather than returning a report that claims nothing about the dropped intent.
  if (provisionCredentials && normalizedMode === 'invite') {
    throw new AppError(
      'provisionCredentials cannot be combined with invite mode (credentials are issued on invite acceptance)',
      400,
      'VALIDATION_ERROR'
    );
  }

  return {
    actorUserId,
    actorEmail,
    actorIsPlatformAdmin,
    actorOrgRole,
    targetOrgId,
    defaultRole: resolvedDefaultRole,
    mode: normalizedMode,
    provisionCredentials: Boolean(provisionCredentials),
    allowOwner: Boolean(allowOwner)
  };
}

/**
 * Validate a single raw row into a normalized shape or a rejection reason.
 * Does NOT touch the DB (that's dedup/create in runImport).
 *
 * @param {Object} raw
 * @param {Object} ctx
 * @returns {{ ok: boolean, value?: Object, reason?: string }}
 */
function validateRow(raw, ctx) {
  const email = String(raw.email || '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, reason: 'Invalid email' };
  }

  const rawStatus = String(raw.status || '').trim().toLowerCase();
  if (rawStatus && !VALID_STATUS.has(rawStatus)) {
    return { ok: false, reason: 'Invalid status' };
  }

  const rawRole = String(raw.role || '').trim().toLowerCase();
  const role = rawRole || ctx.defaultRole || 'member';
  if (!VALID_ROLES.has(role)) {
    return { ok: false, reason: 'Invalid role' };
  }

  return {
    ok: true,
    value: {
      email,
      role,
      status: rawStatus || 'active',
      password: raw.password ? String(raw.password) : null,
      displayName: raw.display_name ? String(raw.display_name).trim() : null,
      firstName: raw.first_name ? String(raw.first_name).trim() : null,
      lastName: raw.last_name ? String(raw.last_name).trim() : null,
      authGroup: raw.auth_group ? String(raw.auth_group).trim() : null,
      nexusGroup: raw.nexus_group ? String(raw.nexus_group).trim() : null
    }
  };
}

function appendReason(rowResult, reason) {
  rowResult.reason = rowResult.reason ? `${rowResult.reason}; ${reason}` : reason;
}

/**
 * Run the import over already-parsed rows. Rows are independent (no transaction);
 * each is processed in its own try/catch so one bad row never aborts the batch.
 *
 * @param {Array<Object>} rows - parsed CSV rows (header-keyed)
 * @param {Object} ctx - from resolveImportContext
 * @returns {Promise<Object>} the extended report
 */
async function runImport(rows, ctx) {
  const { User } = require('../models');

  const report = {
    created: 0,
    skipped: 0,
    failed: 0,
    invited: 0,
    organizationId: ctx.targetOrgId || null,
    rows: []
  };

  const seenEmails = new Set(); // in-file dedup (distinct from DB-existing)

  for (let i = 0; i < rows.length; i += 1) {
    const rowNum = i + 1;
    const raw = rows[i] || {};
    // eslint-disable-next-line no-await-in-loop
    const rowResult = await processRow(raw, rowNum, ctx, seenEmails, User);
    report.rows.push(rowResult);
    if (rowResult.outcome === 'created') report.created += 1;
    else if (rowResult.outcome === 'invited') report.invited += 1;
    else if (rowResult.outcome === 'skipped') report.skipped += 1;
    else report.failed += 1;
  }

  return report;
}

/**
 * Process one row → a per-row report object. Never throws (its own try/catch).
 */
async function processRow(raw, rowNum, ctx, seenEmails, User) {
  const rowResult = {
    row: rowNum,
    email: String(raw.email || '').trim().toLowerCase() || (raw.email ?? ''),
    outcome: 'failed',
    reason: null,
    orgRole: null,
    authGroup: null,
    nexusGroup: null,
    credentialsIssued: false
  };

  try {
    const validated = validateRow(raw, ctx);
    if (!validated.ok) {
      rowResult.reason = validated.reason;
      return rowResult;
    }
    const value = validated.value;
    rowResult.email = value.email;
    rowResult.orgRole = value.role;

    // ── Owner-import policy (server-enforced) ────────────────────────────────
    if (value.role === 'owner') {
      if (!ctx.actorIsPlatformAdmin || !ctx.allowOwner) {
        rowResult.reason = 'owner cannot be assigned via import';
        return rowResult;
      }
      // platform admin + allowOwner: proceed, but membership only — never ownerId.
    }

    // ── Role ceiling (org admins only; platform admin bypasses) ──────────────
    if (!ctx.actorIsPlatformAdmin && rankOf(value.role) > rankOf(ctx.actorOrgRole)) {
      rowResult.reason = 'Cannot assign role above your own';
      return rowResult;
    }

    // ── In-file dedup (distinct from DB-existing) ────────────────────────────
    if (seenEmails.has(value.email)) {
      rowResult.outcome = 'skipped';
      rowResult.reason = 'Duplicate row in file';
      return rowResult;
    }
    seenEmails.add(value.email);

    // ── DB-existing ──────────────────────────────────────────────────────────
    const existing = await User.findOne({ where: { email: value.email } });
    if (existing) {
      rowResult.outcome = 'skipped';
      rowResult.reason = 'Already exists';
      return rowResult;
    }

    // Echo nexus_group as recognized/deferred regardless of mode.
    if (value.nexusGroup) {
      rowResult.nexusGroup = value.nexusGroup;
    }

    if (ctx.mode === 'invite') {
      await createInviteRow(value, ctx, rowResult, User);
    } else {
      await createUserRow(value, ctx, rowResult, User);
    }

    return rowResult;
  } catch (err) {
    rowResult.outcome = 'failed';
    appendReason(rowResult, err.message || 'Import failed');
    return rowResult;
  }
}

/**
 * create mode: create the active user, add org membership with the row's role,
 * assign the auth RBAC group, (optionally) provision credentials, echo nexus.
 */
async function createUserRow(value, ctx, rowResult, User) {
  const user = await User.create({
    email: value.email,
    passwordHash: value.password || crypto.randomBytes(24).toString('base64'),
    displayName: value.displayName || null,
    firstName: value.firstName || null,
    lastName: value.lastName || null,
    status: value.status
  });
  rowResult.outcome = 'created';

  // Post-create steps are BEST-EFFORT. The User row is the primary artifact and
  // already exists, so an infra/DB error in membership or group assignment must
  // ANNOTATE the row, never downgrade a 'created' row to 'failed' — a false
  // 'failed' both lies in the report and makes a retry hit 'Already exists'.
  if (ctx.targetOrgId) {
    try {
      await organizationService.addMember(ctx.targetOrgId, user.id, {
        role: value.role,
        invitedBy: ctx.actorUserId
      });
    } catch (err) {
      appendReason(rowResult, `membership not applied: ${err.message}`);
    }
  }

  try {
    await assignAuthGroup(value, ctx, rowResult, user);
  } catch (err) {
    appendReason(rowResult, `auth_group not applied: ${err.message}`);
  }
  await maybeAssignNexusGroup(value, rowResult, user);
  await maybeProvisionCredentials(value, ctx, rowResult, user);
}

/**
 * invite mode: create the user status:'inactive', mint an activation token, and
 * email it. Org membership + credentials are DEFERRED to invite-accept
 * (inviteService.acceptInvite provisions on activation). auth_group/nexus_group
 * are still echoed/assigned (they don't need an active account).
 */
async function createInviteRow(value, ctx, rowResult, User) {
  let inviteService;
  let getEmailService;
  try {
    inviteService = require('./inviteService');
    ({ getEmailService } = require('./emailService'));
  } catch (err) {
    rowResult.outcome = 'failed';
    appendReason(rowResult, 'invite mode unavailable');
    return;
  }

  const user = await User.create({
    email: value.email,
    passwordHash: crypto.randomBytes(24).toString('base64'),
    displayName: value.displayName || null,
    firstName: value.firstName || null,
    lastName: value.lastName || null,
    status: 'inactive',
    emailVerified: false
  });

  const { rawToken } = await inviteService.createInvite({
    email: value.email,
    kind: 'activation',
    userId: user.id,
    organizationId: ctx.targetOrgId || null,
    role: value.role,
    invitedBy: ctx.actorUserId
  });
  rowResult.outcome = 'invited';

  // Best-effort activation email (swallow send failures, like forgot-password).
  try {
    const emailService = await getEmailService();
    await emailService.sendActivationEmail(
      { email: value.email, displayName: user.displayName },
      rawToken,
      { organizationId: ctx.targetOrgId || null }
    );
  } catch (err) {
    // Non-fatal: the account + token exist; the token is dev-echoable elsewhere.
  }

  await assignAuthGroup(value, ctx, rowResult, user);
  await maybeAssignNexusGroup(value, rowResult, user);
}

/**
 * Resolve the org-scoped auth RBAC Group by { slug, organizationId } and add the
 * user to it. Not found → non-fatal: the row stays created/invited, authGroup is
 * echoed null with a reason.
 */
async function assignAuthGroup(value, ctx, rowResult, user) {
  if (!value.authGroup) {
    return;
  }
  const { Group, UserGroup } = require('../models');
  const group = await Group.findOne({
    where: { slug: value.authGroup, organizationId: ctx.targetOrgId || null }
  });
  if (!group) {
    rowResult.authGroup = null;
    appendReason(rowResult, 'auth_group not found');
    return;
  }
  await UserGroup.findOrCreate({
    where: { userId: user.id, groupId: group.id },
    defaults: { userId: user.id, groupId: group.id, role: 'member' }
  });
  rowResult.authGroup = value.authGroup;
}

/**
 * nexus_group: cross-module, deferred. Always echoed (done in processRow). Only
 * ASSIGNED when USER_IMPORT_NEXUS_ASSIGN=true — then lazily require the nexus
 * membership service and best-effort joinGroup. Inert until FEAT-032 supplies the
 * org→nexus-group linkage.
 *
 * SECURITY — BEFORE this path is enabled (flag on), it MUST be hardened: the
 * attacker-supplied `nexus_group` value is currently joined with NO check that
 * the group belongs to the target org or that the actor may add members to it
 * (a cross-tenant group-join primitive). When lighting this up, resolve
 * nexus_group only within the target org's linked nexus group(s) and verify the
 * actor's authority over it (see FEAT-035 review finding #5). Do not enable the
 * flag until that authz is in place.
 */
async function maybeAssignNexusGroup(value, rowResult, user) {
  if (!value.nexusGroup || !nexusAssignEnabled()) {
    return; // parsed + echoed only (the default, slice-A behavior)
  }
  try {
    const nexusMembershipService = require('../../../nexus/src/services/membershipService');
    await nexusMembershipService.joinGroup(user.id, value.nexusGroup, {});
  } catch (err) {
    appendReason(rowResult, `nexus_group assignment failed: ${err.message}`);
  }
}

/**
 * provisionCredentials: best-effort per-member cert/token via the one auth-owned
 * hook. Failure is NOT row-fatal — the account is the primary artifact.
 */
async function maybeProvisionCredentials(value, ctx, rowResult, user) {
  if (!ctx.provisionCredentials || !ctx.targetOrgId) {
    return;
  }
  try {
    const { provisionMemberCredentials } = require('./memberProvisioningService');
    await provisionMemberCredentials(ctx.targetOrgId, user.id, value.role);
    rowResult.credentialsIssued = true;
  } catch (err) {
    rowResult.credentialsIssued = false;
    appendReason(rowResult, `credentialing failed: ${err.message}`);
  }
}

module.exports = {
  MAX_IMPORT_ROWS,
  parseCsvBuffer,
  resolveImportContext,
  validateRow,
  runImport,
  rankOf
};
