/**
 * ═══════════════════════════════════════════════════════════════════════
 * Invite Service (FEAT-034)
 * ═══════════════════════════════════════════════════════════════════════
 * Owns invite/activation token generation, at-rest hashing, and the single-use
 * state machine. The HTTP layer (routes/auth.js accept, routes/users.js admin)
 * is a thin wrapper; batch callers (FEAT-035 import invite-email mode) call
 * these functions directly in-process.
 *
 * Token model: a random 32-byte base64url raw token is emailed ONCE and never
 * stored — only its sha256 hash is persisted (mirrors the OAuth2Token /
 * MFA-backup-code convention). Tokens are single-use (status flips to
 * 'accepted' on consume), expire after 72h, and are superseded on re-invite.
 *
 * Non-enumerating rejection: expired / revoked / used / unknown / null all
 * surface the SAME AppError('Invalid or expired invitation', 400,
 * 'INVALID_TOKEN') — indistinguishable to the client, no user enumeration.
 */

const crypto = require('crypto');
const { AppError, logger } = require('@exprsn/shared');
const { Invitation, User, sequelize } = require('../models');
const { validatePasswordOrThrow } = require('./passwordService');

const TOKEN_BYTES = 32;
const DEFAULT_TTL_MS = 72 * 3600 * 1000; // 72h invite window (vs 1h reset)

const genRawToken = () => crypto.randomBytes(TOKEN_BYTES).toString('base64url'); // 43 chars, URL-safe
const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

const INVALID_TOKEN = () => new AppError('Invalid or expired invitation', 400, 'INVALID_TOKEN');

/**
 * Create a single-use invite/activation token. Returns { invitation, rawToken }.
 * rawToken is returned ONCE (to be emailed / dev-echoed); only its hash is
 * persisted. Does NOT send email — the caller decides (route sends; import
 * batches). Supersedes any prior pending invite for the same (email, kind) so a
 * re-invite invalidates the old link.
 *
 * @param {Object} args
 * @param {string} args.email            required; lowercased + trimmed inside
 * @param {'invite'|'activation'} [args.kind='invite']
 * @param {string|null} [args.organizationId=null]
 * @param {'owner'|'admin'|'member'|'guest'} [args.role='member']
 * @param {string|null} [args.invitedBy=null]  auth users.id
 * @param {string|null} [args.userId=null]     pre-created user (import/activation)
 * @param {number} [args.ttlMs=DEFAULT_TTL_MS]
 * @param {Object} [args.metadata={}]
 * @returns {Promise<{ invitation: Invitation, rawToken: string }>}
 */
async function createInvite({
  email,
  kind = 'invite',
  organizationId = null,
  role = 'member',
  invitedBy = null,
  userId = null,
  ttlMs = DEFAULT_TTL_MS,
  metadata = {}
} = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    throw new AppError('Invalid email', 400, 'VALIDATION_ERROR');
  }

  const rawToken = genRawToken();
  const tokenHash = hashToken(rawToken);

  // Supersede prior pending invites for the same (email, kind) — one active link.
  await Invitation.update(
    { status: 'revoked', revokedAt: Date.now() },
    { where: { email: normalizedEmail, kind, status: 'pending' } }
  );

  const invitation = await Invitation.create({
    tokenHash,
    email: normalizedEmail,
    kind,
    organizationId,
    role,
    invitedBy,
    userId,
    status: 'pending',
    expiresAt: Date.now() + ttlMs,
    metadata
  });

  return { invitation, rawToken };
}

/**
 * Look up a still-valid pending invite by RAW token. Returns the Invitation or
 * throws INVALID_TOKEN. Centralizes the expired/revoked/used/happy decision so
 * the route and import batch share one non-enumerating rejection ladder.
 *
 * @param {string} rawToken
 * @returns {Promise<Invitation>}
 */
async function resolveInvite(rawToken) {
  if (!rawToken) {
    throw INVALID_TOKEN();
  }

  const inv = await Invitation.findOne({ where: { tokenHash: hashToken(rawToken) } });

  if (!inv) {
    throw INVALID_TOKEN();
  }
  if (inv.status === 'revoked' || inv.status === 'accepted' || inv.status === 'expired') {
    throw INVALID_TOKEN();
  }
  if (inv.status === 'pending' && Number(inv.expiresAt) <= Date.now()) {
    // Best-effort lazy expiry flip; the rejection is what matters.
    await inv.update({ status: 'expired' }).catch(() => {});
    throw INVALID_TOKEN();
  }

  return inv;
}

/**
 * Accept/activate: consume a raw token, set the user's password, activate the
 * account, and flip the invite to 'accepted'. The user upsert + status flip are
 * wrapped in ONE transaction (accept both mints/activates a user AND consumes a
 * single-use token, so they must be atomic).
 *
 * The FEAT-032 member-provisioning hook is called OUTSIDE the transaction,
 * best-effort (cross-module saga territory — a provisioning hiccup must not
 * un-accept the invite or block the user's login).
 *
 * @param {Object} args
 * @param {string} args.token
 * @param {string} args.password
 * @param {string} [args.displayName]
 * @returns {Promise<{ user: User }>}
 */
async function acceptInvite({ token, password, displayName } = {}) {
  // Full password policy BEFORE consuming the token, so a weak password never
  // spends the invite (T8).
  validatePasswordOrThrow(password);

  const inv = await resolveInvite(token);

  const user = await sequelize.transaction(async (t) => {
    // Re-fetch + LOCK the invite row inside the txn and re-assert it is still
    // consumable. Closes the single-use TOCTOU race: two concurrent accepts of
    // the same raw token both pass the pre-txn resolveInvite() read; the row
    // lock serializes them so the second sees status='accepted' and is rejected.
    const locked = await Invitation.findByPk(inv.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!locked || locked.status !== 'pending' || Number(locked.expiresAt) <= Date.now()) {
      throw new AppError('Invalid or expired invitation', 400, 'INVALID_TOKEN');
    }

    let target;
    if (locked.userId) {
      // Activation path: the invite is BOUND to a specific pre-created user (an
      // import/activation). Operate ONLY on that user — never fall back to an
      // email match (an email match would let an invite mutate an unrelated
      // account). Setting the password activates a first-time account.
      target = await User.findByPk(locked.userId, { transaction: t });
      if (!target) {
        throw new AppError('Invalid or expired invitation', 400, 'INVALID_TOKEN');
      }
      if (target.status === 'suspended') {
        // An invite must not silently un-suspend a disabled account.
        throw new AppError('This account cannot be activated', 403, 'ACCOUNT_SUSPENDED');
      }
      target.passwordHash = password;
      target.emailVerified = true;
      target.status = 'active';
      if (displayName && !target.displayName) {
        target.displayName = displayName;
      }
      await target.save({ transaction: t });
    } else {
      // Invite path (no bound user): CREATE-ONLY. If an account already exists
      // for this email we must NOT overwrite its credentials — an admin-chosen
      // invite email could otherwise reset a victim's password (account
      // takeover). Reject instead; an existing user accepts while signed in.
      const existing = await User.findOne({ where: { email: locked.email }, transaction: t });
      if (existing) {
        throw new AppError('An account already exists for this email; sign in to accept the invitation', 409, 'ACCOUNT_EXISTS');
      }
      // New user: the beforeCreate hook bcrypts passwordHash. Receiving the
      // emailed token proves control of the address → emailVerified:true.
      target = await User.create(
        {
          email: locked.email,
          passwordHash: password,
          displayName: displayName || locked.email,
          emailVerified: true,
          status: 'active'
        },
        { transaction: t }
      );
    }

    // Single-use flip — inside the txn (and under the row lock), so a failed
    // user write never spends the token and a spent token never lacks its user.
    await locked.update(
      { status: 'accepted', acceptedAt: Date.now(), userId: target.id },
      { transaction: t }
    );

    return target;
  });

  // FEAT-032 seam — best-effort, cross-module, non-atomic (saga territory).
  // Provision the accepted user's org membership + entity cert + org-scoped
  // token when the invite carries an org context.
  if (inv.organizationId) {
    try {
      const { provisionMemberCredentials } = require('./memberProvisioningService');
      await provisionMemberCredentials(inv.organizationId, user.id, inv.role || 'member');
    } catch (provisionErr) {
      logger.error('Member provisioning failed after invite accept', {
        userId: user.id,
        organizationId: inv.organizationId,
        invitationId: inv.id,
        error: provisionErr.message
      });
    }
  }

  return { user };
}

/**
 * List invites for admin surfaces. Never returns tokenHash. Paginated.
 *
 * @param {Object} [filters]
 * @returns {Promise<{ rows: Array<Object>, count: number }>}
 */
async function listInvites({
  organizationId = null,
  email = null,
  status = null,
  kind = null,
  limit = 50,
  offset = 0
} = {}) {
  const where = {};
  if (organizationId) where.organizationId = organizationId;
  if (email) where.email = String(email).trim().toLowerCase();
  if (status) where.status = status;
  if (kind) where.kind = kind;

  const { rows, count } = await Invitation.findAndCountAll({
    where,
    limit,
    offset,
    order: [['createdAt', 'DESC']],
    // Never leak the token hash (or free-form metadata) to the admin list.
    attributes: { exclude: ['tokenHash', 'metadata'] }
  });

  return { rows, count };
}

/**
 * Revoke a pending invite by id (admin). Idempotent — a no-op when the invite is
 * already accepted / revoked / expired (never throws for those).
 *
 * @param {string} id
 * @param {Object} [opts]
 * @param {string|null} [opts.actorId=null]
 * @returns {Promise<{ success: boolean }>}
 */
async function revokeInvite(id, { actorId = null } = {}) {
  const inv = await Invitation.findByPk(id);
  if (!inv) {
    throw new AppError('Invitation not found', 404, 'INVITE_NOT_FOUND');
  }

  if (inv.status === 'pending') {
    await inv.update({
      status: 'revoked',
      revokedAt: Date.now(),
      metadata: { ...(inv.metadata || {}), revokedBy: actorId }
    });
  }

  return { success: true };
}

module.exports = {
  createInvite,
  resolveInvite,
  acceptInvite,
  listInvites,
  revokeInvite,
  // exported for tests (at-rest hashing assertions)
  hashToken
};
