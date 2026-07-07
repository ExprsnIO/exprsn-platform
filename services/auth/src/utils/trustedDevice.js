/**
 * ═══════════════════════════════════════════════════════════
 * Trusted-device ("remember this device") tokens
 *
 * When an org 2FA policy sets `mfa.rememberDeviceDays > 0`, a user who completes
 * the MFA challenge may opt to trust the device. We drop a signed, httpOnly
 * cookie carrying a short-lived RS256 JWT; on a later login from the same device
 * the MFA challenge is skipped (STATUS.md #12d).
 *
 * Security properties:
 *  - Tamper-proof: RS256 over the same OIDC keypair used for MFA pending tokens.
 *  - User-bound: `sub` must match the authenticating user.
 *  - Auto-revoking: `tdv` binds the token to a fingerprint of the user's current
 *    `mfaSecret`, so disabling/re-enrolling MFA (which rotates the secret)
 *    invalidates every outstanding trusted-device cookie with no server state.
 *  - Time-bound: `exp` = rememberDeviceDays from issuance (fixed, not sliding).
 *
 * It only skips the SECOND factor — the password is still required to log in, so
 * a stolen cookie alone grants nothing.
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');

const COOKIE_NAME = 'exprsn_td';
const PURPOSE = 'trusted_device';

/** Stable short fingerprint of the user's current MFA secret. */
function deviceVersion(user) {
  return crypto
    .createHash('sha256')
    .update(String(user.mfaSecret || ''))
    .digest('hex')
    .slice(0, 16);
}

/** Issue a trusted-device JWT valid for `days` days. */
function issueTrustedDeviceToken(user, days) {
  const seconds = Math.max(1, Math.floor(Number(days) * 24 * 60 * 60));
  return jwt.sign(
    { sub: user.id, purpose: PURPOSE, tdv: deviceVersion(user) },
    config.jwt.privateKey,
    {
      algorithm: config.jwt.algorithm,
      keyid: config.jwt.keyId,
      issuer: config.oidc.issuer,
      expiresIn: seconds,
    }
  );
}

/**
 * Verify a trusted-device token against a user. Returns true only when the
 * signature is valid, unexpired, purpose-correct, user-bound, and the MFA-secret
 * fingerprint still matches. Never throws.
 */
function verifyTrustedDeviceToken(token, user) {
  if (!token || !user) return false;
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.publicKey, {
      algorithms: ['RS256'], // pinned
      issuer: config.oidc.issuer,
    });
  } catch (_) {
    return false;
  }
  return (
    decoded.purpose === PURPOSE &&
    decoded.sub === user.id &&
    decoded.tdv === deviceVersion(user)
  );
}

/** Read a named cookie from the raw header (this app has no cookie-parser). */
function readCookie(req, name) {
  const header = req.headers && req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function getTrustedDeviceToken(req) {
  return readCookie(req, COOKIE_NAME);
}

function cookieOptions(days) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(1000, Math.floor(Number(days) * 24 * 60 * 60 * 1000)),
  };
}

/** Set the trusted-device cookie on the response. */
function setTrustedDeviceCookie(res, user, days) {
  res.cookie(COOKIE_NAME, issueTrustedDeviceToken(user, days), cookieOptions(days));
}

/** Clear the trusted-device cookie (e.g. on MFA disable). */
function clearTrustedDeviceCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

module.exports = {
  COOKIE_NAME,
  deviceVersion,
  issueTrustedDeviceToken,
  verifyTrustedDeviceToken,
  getTrustedDeviceToken,
  setTrustedDeviceCookie,
  clearTrustedDeviceCookie,
};
