/**
 * ═══════════════════════════════════════════════════════════
 * MFA pending-login tokens + backup-code hashing
 *
 * When a user with MFA enabled passes primary authentication, no real
 * auth token is issued. Instead a short-lived (5 min) RS256 JWT carrying
 * only { sub, purpose: 'mfa' } is returned; the client must present it
 * together with a TOTP/backup code to complete login.
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');

const MFA_TOKEN_TTL = '5m';

/**
 * Issue a short-lived MFA pending-login token for a user.
 * Carries only { sub, purpose: 'mfa' } - it grants nothing by itself.
 */
function issueMfaToken(user) {
  return jwt.sign(
    { sub: user.id, purpose: 'mfa' },
    config.jwt.privateKey,
    {
      algorithm: config.jwt.algorithm,
      keyid: config.jwt.keyId,
      issuer: config.oidc.issuer,
      expiresIn: MFA_TOKEN_TTL
    }
  );
}

/**
 * Verify an MFA pending-login token. Throws on any failure.
 * @returns {object} decoded claims ({ sub, purpose, iat, exp, iss })
 */
function verifyMfaToken(token) {
  const decoded = jwt.verify(token, config.jwt.publicKey, {
    algorithms: ['RS256'], // pinned
    issuer: config.oidc.issuer
  });

  if (decoded.purpose !== 'mfa') {
    throw new Error('INVALID_TOKEN_PURPOSE');
  }

  return decoded;
}

/**
 * Hash an MFA backup code for storage/comparison.
 * Backup codes are stored ONLY as sha256 hashes (hex) of the
 * uppercase-normalized code.
 */
function hashBackupCode(code) {
  return crypto
    .createHash('sha256')
    .update(String(code).trim().toUpperCase())
    .digest('hex');
}

module.exports = {
  issueMfaToken,
  verifyMfaToken,
  hashBackupCode
};
