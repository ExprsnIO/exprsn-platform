/**
 * Trusted-device token util (STATUS.md #12d) — signing, verification, and the
 * security bindings (user, MFA-secret version, expiry, tamper). No DB.
 */

const jwt = require('jsonwebtoken');
const config = require('../src/config');
const td = require('../src/utils/trustedDevice');

const user = { id: 'user-1', mfaSecret: 'SECRETBASE32' };

describe('trustedDevice tokens', () => {
  it('round-trips: a freshly issued token verifies for the same user', () => {
    const token = td.issueTrustedDeviceToken(user, 30);
    expect(td.verifyTrustedDeviceToken(token, user)).toBe(true);
  });

  it('rejects a token for a different user', () => {
    const token = td.issueTrustedDeviceToken(user, 30);
    expect(td.verifyTrustedDeviceToken(token, { id: 'user-2', mfaSecret: 'SECRETBASE32' })).toBe(false);
  });

  it('rejects once the MFA secret rotates (disable/re-enrol invalidates it)', () => {
    const token = td.issueTrustedDeviceToken(user, 30);
    expect(td.verifyTrustedDeviceToken(token, { id: 'user-1', mfaSecret: 'DIFFERENTSECRET' })).toBe(false);
  });

  it('rejects a tampered token', () => {
    const token = td.issueTrustedDeviceToken(user, 30);
    const [h, p, s] = token.split('.');
    const tampered = `${h}.${p.slice(0, -2)}XY.${s}`;
    expect(td.verifyTrustedDeviceToken(tampered, user)).toBe(false);
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(
      { sub: user.id, purpose: 'trusted_device', tdv: td.deviceVersion(user) },
      config.jwt.privateKey,
      { algorithm: config.jwt.algorithm, issuer: config.oidc.issuer, expiresIn: -10 },
    );
    expect(td.verifyTrustedDeviceToken(expired, user)).toBe(false);
  });

  it('rejects a token with the wrong purpose', () => {
    const wrong = jwt.sign(
      { sub: user.id, purpose: 'mfa', tdv: td.deviceVersion(user) },
      config.jwt.privateKey,
      { algorithm: config.jwt.algorithm, issuer: config.oidc.issuer, expiresIn: 60 },
    );
    expect(td.verifyTrustedDeviceToken(wrong, user)).toBe(false);
  });

  it('handles missing/empty input safely', () => {
    expect(td.verifyTrustedDeviceToken(null, user)).toBe(false);
    expect(td.verifyTrustedDeviceToken('not-a-jwt', user)).toBe(false);
    expect(td.verifyTrustedDeviceToken(td.issueTrustedDeviceToken(user, 30), null)).toBe(false);
  });

  it('reads the named cookie from the raw header', () => {
    const token = td.issueTrustedDeviceToken(user, 30);
    const req = { headers: { cookie: `foo=bar; ${td.COOKIE_NAME}=${encodeURIComponent(token)}; baz=qux` } };
    expect(td.getTrustedDeviceToken(req)).toBe(token);
    expect(td.getTrustedDeviceToken({ headers: {} })).toBeNull();
  });
});
