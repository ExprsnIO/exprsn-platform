/**
 * Invite / Activation token flow tests (FEAT-034)
 *
 * Service-level token-state matrix (inviteService.resolveInvite / acceptInvite /
 * createInvite / listInvites / revokeInvite) plus route-level coverage of the
 * public POST /api/auth/accept-invite. Real Postgres, force-synced against the
 * ISOLATED exprsn_auth_test DB (never the real exprsn) — see CLAUDE.md.
 *
 * Key invariant under test: the expired / revoked / used / unknown / null
 * branches are indistinguishable to the client (all INVALID_TOKEN 400) — no
 * user enumeration — while HAPPY is the only path that mutates a user and flips
 * the invite to 'accepted'.
 */

const crypto = require('crypto');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const inviteService = require('../src/services/inviteService');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
} = require('./helpers/testDatabase');

const VALID_PASSWORD = 'Zx9$Kp2mLq7@';

/** Assert a thrown AppError carries the expected errorCode + statusCode. */
async function expectAppError(promise, errorCode, statusCode = 400) {
  let thrown = null;
  try {
    await promise;
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeTruthy();
  expect(thrown.errorCode).toBe(errorCode);
  if (statusCode != null) {
    expect(thrown.statusCode).toBe(statusCode);
  }
  return thrown;
}

describe('Invitations (FEAT-034)', () => {
  let models;

  beforeAll(async () => {
    const db = await setupTestDatabase();
    models = db.models;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
  });

  // ─── Service-level token-state matrix ──────────────────────────────────────

  describe('acceptInvite / resolveInvite state matrix', () => {
    test('T1 happy — new user: creates + activates the account and consumes the invite', async () => {
      const { invitation, rawToken } = await inviteService.createInvite({
        email: 'new@x.io', role: 'member',
      });

      const { user } = await inviteService.acceptInvite({ token: rawToken, password: VALID_PASSWORD });

      expect(user.email).toBe('new@x.io');
      expect(user.emailVerified).toBe(true);
      expect(user.status).toBe('active');
      expect(await bcrypt.compare(VALID_PASSWORD, user.passwordHash)).toBe(true);

      const row = await models.Invitation.findByPk(invitation.id);
      expect(row.status).toBe('accepted');
      expect(Number(row.acceptedAt)).toBeGreaterThan(0);
      expect(row.userId).toBe(user.id);
    });

    test('T2 happy — pre-created (activation): updates the same user, no duplicate', async () => {
      const pre = await models.User.create(
        { email: 'imp@x.io', displayName: 'Imported', status: 'inactive', emailVerified: false },
        { hooks: false }
      );

      const { rawToken } = await inviteService.createInvite({
        email: 'imp@x.io', kind: 'activation', userId: pre.id,
      });

      const { user } = await inviteService.acceptInvite({ token: rawToken, password: VALID_PASSWORD });

      expect(user.id).toBe(pre.id);
      expect(user.status).toBe('active');
      expect(user.emailVerified).toBe(true);
      expect(await bcrypt.compare(VALID_PASSWORD, user.passwordHash)).toBe(true);

      const count = await models.User.count({ where: { email: 'imp@x.io' } });
      expect(count).toBe(1);
    });

    test('T2b SECURITY — invite (no bound userId) for an EXISTING email does NOT overwrite that account', async () => {
      // Account-takeover regression: an admin-chosen invite email that collides
      // with an existing account must never reset that account's password.
      const victim = await models.User.create(
        { email: 'victim@x.io', displayName: 'Victim', status: 'active', emailVerified: true, passwordHash: 'OriginalPw1!' },
        { hooks: true }
      );
      const originalHash = victim.passwordHash;

      const { rawToken } = await inviteService.createInvite({ email: 'victim@x.io', kind: 'invite' });

      await expect(
        inviteService.acceptInvite({ token: rawToken, password: 'Attacker#Pw9x' })
      ).rejects.toMatchObject({ errorCode: 'ACCOUNT_EXISTS' });

      // Victim's credentials are untouched; still exactly one account.
      const after = await models.User.findByPk(victim.id);
      expect(after.passwordHash).toBe(originalHash);
      expect(await bcrypt.compare('Attacker#Pw9x', after.passwordHash)).toBe(false);
      expect(await models.User.count({ where: { email: 'victim@x.io' } })).toBe(1);
    });

    test('T2c SECURITY — activation invite cannot un-suspend a suspended account', async () => {
      const suspended = await models.User.create(
        { email: 'suspended@x.io', status: 'suspended', emailVerified: true, passwordHash: 'x' },
        { hooks: false }
      );
      const { rawToken } = await inviteService.createInvite({
        email: 'suspended@x.io', kind: 'activation', userId: suspended.id,
      });

      await expect(
        inviteService.acceptInvite({ token: rawToken, password: VALID_PASSWORD })
      ).rejects.toMatchObject({ errorCode: 'ACCOUNT_SUSPENDED' });

      const after = await models.User.findByPk(suspended.id);
      expect(after.status).toBe('suspended');
    });

    test('T3 expired: rejected INVALID_TOKEN, invite flipped to expired, no user created', async () => {
      const { invitation, rawToken } = await inviteService.createInvite({
        email: 'expired@x.io', ttlMs: -1000, // already past
      });

      await expectAppError(
        inviteService.acceptInvite({ token: rawToken, password: VALID_PASSWORD }),
        'INVALID_TOKEN', 400
      );

      const row = await models.Invitation.findByPk(invitation.id);
      expect(row.status).toBe('expired');
      expect(await models.User.count({ where: { email: 'expired@x.io' } })).toBe(0);
    });

    test('T4 revoked: rejected INVALID_TOKEN, invite stays revoked, no user', async () => {
      const { invitation, rawToken } = await inviteService.createInvite({ email: 'revoked@x.io' });
      await inviteService.revokeInvite(invitation.id);

      await expectAppError(
        inviteService.acceptInvite({ token: rawToken, password: VALID_PASSWORD }),
        'INVALID_TOKEN', 400
      );

      const row = await models.Invitation.findByPk(invitation.id);
      expect(row.status).toBe('revoked');
      expect(await models.User.count({ where: { email: 'revoked@x.io' } })).toBe(0);
    });

    test('T5 used (single-use): second accept with same token is rejected', async () => {
      const { invitation, rawToken } = await inviteService.createInvite({ email: 'used@x.io' });

      const { user } = await inviteService.acceptInvite({ token: rawToken, password: VALID_PASSWORD });
      const firstHash = user.passwordHash;

      await expectAppError(
        inviteService.acceptInvite({ token: rawToken, password: 'Dl4#Rt8nWq2@' }),
        'INVALID_TOKEN', 400
      );

      // Password NOT re-changed, still exactly one accepted row + one user.
      const reloaded = await models.User.findByPk(user.id);
      expect(reloaded.passwordHash).toBe(firstHash);
      expect(await models.User.count({ where: { email: 'used@x.io' } })).toBe(1);
      const accepted = await models.Invitation.count({ where: { status: 'accepted' } });
      expect(accepted).toBe(1);
      const row = await models.Invitation.findByPk(invitation.id);
      expect(row.status).toBe('accepted');
    });

    test('T6 unknown token: rejected INVALID_TOKEN', async () => {
      await expectAppError(
        inviteService.acceptInvite({ token: 'garbage-not-a-real-token', password: VALID_PASSWORD }),
        'INVALID_TOKEN', 400
      );
    });

    test('T7 null/empty token: rejected INVALID_TOKEN', async () => {
      await expectAppError(
        inviteService.acceptInvite({ token: undefined, password: VALID_PASSWORD }),
        'INVALID_TOKEN', 400
      );
      await expectAppError(
        inviteService.resolveInvite(''),
        'INVALID_TOKEN', 400
      );
    });

    test('T8 weak password: rejected BEFORE the token is consumed (invite stays pending)', async () => {
      const { invitation, rawToken } = await inviteService.createInvite({ email: 'weak@x.io' });

      await expectAppError(
        inviteService.acceptInvite({ token: rawToken, password: 'short' }),
        'WEAK_PASSWORD', 400
      );

      const row = await models.Invitation.findByPk(invitation.id);
      expect(row.status).toBe('pending'); // NOT consumed
      expect(await models.User.count({ where: { email: 'weak@x.io' } })).toBe(0);

      // The still-pending invite remains acceptable with a valid password.
      const { user } = await inviteService.acceptInvite({ token: rawToken, password: VALID_PASSWORD });
      expect(user.email).toBe('weak@x.io');
    });

    test('T9 supersede on re-invite: the old link is invalidated, the new one works', async () => {
      const { rawToken: tokenA } = await inviteService.createInvite({ email: 'e@x.io' });
      const { rawToken: tokenB } = await inviteService.createInvite({ email: 'e@x.io' });

      // tokenA was superseded (→ revoked) by the second createInvite.
      await expectAppError(
        inviteService.acceptInvite({ token: tokenA, password: VALID_PASSWORD }),
        'INVALID_TOKEN', 400
      );

      const { user } = await inviteService.acceptInvite({ token: tokenB, password: VALID_PASSWORD });
      expect(user.email).toBe('e@x.io');
    });

    test('T10 at-rest hashing: the raw token is never stored; only its sha256 hash', async () => {
      const { invitation, rawToken } = await inviteService.createInvite({ email: 'hash@x.io' });

      const row = await models.Invitation.findByPk(invitation.id);
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      expect(row.tokenHash).toBe(expectedHash);
      expect(row.tokenHash).toBe(inviteService.hashToken(rawToken));
      expect(row.tokenHash).not.toBe(rawToken);
      // The raw token appears in no column of the row.
      expect(JSON.stringify(row.toJSON())).not.toContain(rawToken);
    });
  });

  // ─── listInvites / revokeInvite ────────────────────────────────────────────

  describe('listInvites / revokeInvite', () => {
    test('T11 listInvites projection: excludes tokenHash, filters by status', async () => {
      await inviteService.createInvite({ email: 'a@x.io' });
      const { invitation: b } = await inviteService.createInvite({ email: 'b@x.io' });
      await inviteService.revokeInvite(b.id);

      const pending = await inviteService.listInvites({ status: 'pending' });
      expect(pending.count).toBe(1);
      expect(pending.rows).toHaveLength(1);
      expect(pending.rows[0].email).toBe('a@x.io');
      expect(pending.rows[0].tokenHash).toBeUndefined();

      const revoked = await inviteService.listInvites({ status: 'revoked' });
      expect(revoked.count).toBe(1);
      expect(revoked.rows[0].email).toBe('b@x.io');
    });

    test('T12 revoke idempotent: revoking an accepted invite is a no-op, no throw', async () => {
      const { invitation, rawToken } = await inviteService.createInvite({ email: 'idem@x.io' });
      await inviteService.acceptInvite({ token: rawToken, password: VALID_PASSWORD });

      const out = await inviteService.revokeInvite(invitation.id);
      expect(out).toEqual({ success: true });

      const row = await models.Invitation.findByPk(invitation.id);
      expect(row.status).toBe('accepted'); // unchanged
    });

    test('revokeInvite on unknown id throws INVITE_NOT_FOUND', async () => {
      await expectAppError(
        inviteService.revokeInvite('00000000-0000-0000-0000-000000000000'),
        'INVITE_NOT_FOUND', 404
      );
    });
  });

  // ─── Route-level (public accept endpoint) ──────────────────────────────────

  describe('POST /api/auth/accept-invite', () => {
    test('happy path → 200 with { user, token }; the bearer then works', async () => {
      const { rawToken } = await inviteService.createInvite({ email: 'route@x.io' });

      const res = await request(app)
        .post('/api/auth/accept-invite')
        .send({ token: rawToken, password: VALID_PASSWORD })
        .expect(200);

      expect(res.body.user).toBeTruthy();
      expect(res.body.user.email).toBe('route@x.io');
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.token).toBeTruthy();

      // The minted bearer is accepted by an authenticated route.
      await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${res.body.token}`)
        .expect(200);
    });

    test('expired / revoked / used / unknown are indistinguishable (all INVALID_TOKEN 400)', async () => {
      // expired
      const { rawToken: expiredTok } = await inviteService.createInvite({ email: 'r-exp@x.io', ttlMs: -1000 });
      // revoked
      const { invitation: revInv, rawToken: revokedTok } = await inviteService.createInvite({ email: 'r-rev@x.io' });
      await inviteService.revokeInvite(revInv.id);
      // used
      const { rawToken: usedTok } = await inviteService.createInvite({ email: 'r-used@x.io' });
      await inviteService.acceptInvite({ token: usedTok, password: VALID_PASSWORD });

      const bodies = [];
      for (const token of [expiredTok, revokedTok, usedTok, 'totally-unknown-token']) {
        const res = await request(app)
          .post('/api/auth/accept-invite')
          .send({ token, password: VALID_PASSWORD })
          .expect(400);
        expect(res.body.error).toBe('INVALID_TOKEN');
        bodies.push(res.body.message);
      }
      // Same non-enumerating message across all four rejection branches.
      expect(new Set(bodies).size).toBe(1);
    });

    test('weak password → 400 validation error (Joi rejects before the token is touched)', async () => {
      const { invitation, rawToken } = await inviteService.createInvite({ email: 'r-weak@x.io' });

      const res = await request(app)
        .post('/api/auth/accept-invite')
        .send({ token: rawToken, password: 'short' })
        .expect(400);

      expect(res.body.error).toBe('VALIDATION_ERROR');

      // Invite not consumed.
      const row = await models.Invitation.findByPk(invitation.id);
      expect(row.status).toBe('pending');
    });
  });
});
