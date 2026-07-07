/**
 * Org 2FA policy resolution + enrollment evaluation (STATUS.md #12). Pure
 * decision logic over a user's orgs — most-restrictive wins, grace anchored on
 * account creation, method restrictions honoured, unbuilt-method-only policies
 * can't hard-gate. No live DB (models fully mocked).
 */

jest.mock('../src/models', () => ({
  Organization: { findAll: jest.fn() },
  OrganizationMember: { findAll: jest.fn() },
}));

const { Organization, OrganizationMember } = require('../src/models');
const svc = require('../src/services/mfaPolicyService');

const DAY = 24 * 60 * 60 * 1000;

/** Build an org record with a requireMfa + mfa settings block. */
function org(id, { requireMfa = false, mfa } = {}) {
  return { id, status: 'active', settings: { requireMfa, ...(mfa ? { mfa } : {}) } };
}

/** Wire the two model queries: member-of orgs + owned orgs. */
function withOrgs({ member = [], owned = [] }) {
  OrganizationMember.findAll.mockResolvedValue(member.map((o) => ({ organization: o })));
  Organization.findAll.mockResolvedValue(owned);
}

beforeEach(() => {
  Organization.findAll.mockReset();
  OrganizationMember.findAll.mockReset();
});

describe('resolveMfaPolicy', () => {
  it('returns not-required when the user has no orgs', async () => {
    withOrgs({});
    const p = await svc.resolveMfaPolicy({ id: 'u1' });
    expect(p.required).toBe(false);
    expect(p.allowedMethods).toEqual(['totp', 'backup_codes']);
  });

  it('returns not-required when no org requires MFA', async () => {
    withOrgs({ member: [org('o1', { requireMfa: false })] });
    const p = await svc.resolveMfaPolicy({ id: 'u1' });
    expect(p.required).toBe(false);
  });

  it('requires MFA when any member org requires it', async () => {
    withOrgs({ member: [org('o1', { requireMfa: false }), org('o2', { requireMfa: true })] });
    const p = await svc.resolveMfaPolicy({ id: 'u1' });
    expect(p.required).toBe(true);
    expect(p.totpAllowed).toBe(true);
  });

  it('requires MFA when an OWNED org requires it (ownerId path)', async () => {
    withOrgs({ owned: [org('o9', { requireMfa: true })] });
    const p = await svc.resolveMfaPolicy({ id: 'u1' });
    expect(p.required).toBe(true);
  });

  it('takes the most-restrictive grace across requiring orgs (min)', async () => {
    withOrgs({ member: [
      org('o1', { requireMfa: true, mfa: { enrollmentGracePeriodDays: 30 } }),
      org('o2', { requireMfa: true, mfa: { enrollmentGracePeriodDays: 1 } }),
    ] });
    const p = await svc.resolveMfaPolicy({ id: 'u1' });
    expect(p.gracePeriodDays).toBe(1);
  });

  it('intersects allowedMethods across requiring orgs', async () => {
    withOrgs({ member: [
      org('o1', { requireMfa: true, mfa: { allowedMethods: ['totp', 'backup_codes', 'sms'] } }),
      org('o2', { requireMfa: true, mfa: { allowedMethods: ['totp', 'sms'] } }),
    ] });
    const p = await svc.resolveMfaPolicy({ id: 'u1' });
    expect(p.allowedMethods.sort()).toEqual(['sms', 'totp']);
    expect(p.totpAllowed).toBe(true);
  });

  it('flags totpAllowed=false when policy permits only unbuilt methods', async () => {
    withOrgs({ member: [org('o1', { requireMfa: true, mfa: { allowedMethods: ['webauthn'] } })] });
    const p = await svc.resolveMfaPolicy({ id: 'u1' });
    expect(p.required).toBe(true);
    expect(p.totpAllowed).toBe(false);
  });
});

describe('evaluateEnrollment', () => {
  it('is a no-op when not required', () => {
    const e = svc.evaluateEnrollment({ createdAt: new Date() }, { required: false, allowedMethods: [] });
    expect(e.enrollmentRequired).toBe(false);
    expect(e.graceExpired).toBe(false);
  });

  it('hard-gates when grace has elapsed (old account, TOTP allowed)', () => {
    const created = new Date(Date.now() - 60 * DAY);
    const e = svc.evaluateEnrollment(
      { createdAt: created },
      { required: true, totpAllowed: true, gracePeriodDays: 7, allowedMethods: ['totp'] },
    );
    expect(e.enrollmentRequired).toBe(true);
    expect(e.graceExpired).toBe(true);
  });

  it('stays soft while still inside the grace window', () => {
    const created = new Date(); // just now
    const e = svc.evaluateEnrollment(
      { createdAt: created },
      { required: true, totpAllowed: true, gracePeriodDays: 7, allowedMethods: ['totp'] },
    );
    expect(e.enrollmentRequired).toBe(true);
    expect(e.graceExpired).toBe(false);
  });

  it('never hard-gates when no enrollable method is permitted', () => {
    const created = new Date(Date.now() - 60 * DAY);
    const e = svc.evaluateEnrollment(
      { createdAt: created },
      { required: true, totpAllowed: false, gracePeriodDays: 0, allowedMethods: ['webauthn'] },
    );
    expect(e.graceExpired).toBe(false);
  });
});

describe('evaluateForLogin', () => {
  it('short-circuits for an already-enrolled user (no org query)', async () => {
    const out = await svc.evaluateForLogin({ id: 'u1', mfaEnabled: true });
    expect(out.required).toBe(false);
    expect(out.enrolled).toBe(true);
    expect(OrganizationMember.findAll).not.toHaveBeenCalled();
  });

  it('hard-gates an un-enrolled user in a requiring org past grace', async () => {
    withOrgs({ member: [org('o1', { requireMfa: true, mfa: { enrollmentGracePeriodDays: 0 } })] });
    const out = await svc.evaluateForLogin({ id: 'u1', mfaEnabled: false, createdAt: new Date(Date.now() - DAY) });
    expect(out.required).toBe(true);
    expect(out.enrollmentRequired).toBe(true);
    expect(out.graceExpired).toBe(true);
  });
});
