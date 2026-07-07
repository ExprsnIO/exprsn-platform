/**
 * ═══════════════════════════════════════════════════════════
 * MFA Routes
 * Multi-Factor Authentication setup and verification
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { asyncHandler, AppError, logger, strictLimiter, standardLimiter } = require('@exprsn/shared');
const { requireAuth } = require('../middleware/requireAuth');
const { User } = require('../models');
const { hashBackupCode } = require('../utils/mfaToken');
const mfaPolicyService = require('../services/mfaPolicyService');
const trustedDevice = require('../utils/trustedDevice');
const config = require('../config');

/**
 * Generate a set of backup codes.
 * @returns {{ plaintext: string[], hashes: string[] }}
 */
function generateBackupCodes(count = 10) {
  const plaintext = Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );
  return {
    plaintext,
    hashes: plaintext.map(hashBackupCode)
  };
}

const router = express.Router();

// All MFA routes require authentication
router.use(requireAuth);

/**
 * POST /api/mfa/setup
 * Generate MFA secret and QR code for user
 */
router.post('/setup', asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (user.mfaEnabled) {
    throw new AppError('MFA is already enabled', 400, 'MFA_ALREADY_ENABLED');
  }

  // Honour the org policy's allowed methods (STATUS.md #12b). These endpoints
  // enrol TOTP (+ backup codes); if a requiring org restricts to a method that
  // isn't TOTP, block setup with a clear message rather than silently enrolling
  // a disallowed factor. Voluntary MFA (no org requirement) is unaffected.
  const policy = await mfaPolicyService.resolveMfaPolicy(user);
  if (policy.required && !policy.totpAllowed) {
    throw new AppError(
      'Your organization\'s 2FA policy requires a method that is not yet available. Contact your administrator.',
      400,
      'MFA_METHOD_NOT_ALLOWED'
    );
  }

  // Generate secret
  const secret = speakeasy.generateSecret({
    name: `Exprsn (${user.email})`,
    issuer: 'Exprsn'
  });

  // Generate backup codes (10 codes) - only sha256 hashes are persisted
  const backupCodes = generateBackupCodes();

  // Store secret temporarily (not enabled yet)
  user.mfaSecret = secret.base32;
  user.mfaBackupCodes = backupCodes.hashes;
  await user.save();

  // Generate QR code
  const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

  logger.info('MFA setup initiated', { userId: user.id });

  res.json({
    message: 'MFA setup initiated. Scan QR code and verify with a code.',
    secret: secret.base32,
    qrCode: qrCodeDataUrl,
    // Shown ONCE - only hashes are stored server-side
    backupCodes: backupCodes.plaintext
  });
}));

/**
 * POST /api/mfa/verify
 * Verify MFA token and enable MFA
 */
router.post('/verify',
  strictLimiter, // 10 req/15min to prevent brute force
  asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    throw new AppError('MFA token required', 400, 'TOKEN_REQUIRED');
  }

  const user = await User.findByPk(req.user.id);

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (user.mfaEnabled) {
    throw new AppError('MFA is already enabled', 400, 'MFA_ALREADY_ENABLED');
  }

  if (!user.mfaSecret) {
    throw new AppError('MFA setup not initiated', 400, 'MFA_NOT_SETUP');
  }

  // Verify token
  const verified = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token,
    window: 1 // Allow at most 1 time step before/after
  });

  if (!verified) {
    throw new AppError('Invalid MFA token', 400, 'INVALID_MFA_TOKEN');
  }

  // Enable MFA
  user.mfaEnabled = true;
  await user.save();

  // Mark MFA as verified in session
  req.session.mfaVerified = true;

  logger.info('MFA enabled', { userId: user.id });

  res.json({
    // Backup codes are stored hashed and were already shown once at setup
    message: 'MFA enabled successfully'
  });
}));

/**
 * POST /api/mfa/validate
 * Validate MFA token during login
 */
router.post('/validate',
  strictLimiter, // 10 req/15min to prevent brute force
  asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    throw new AppError('MFA token required', 400, 'TOKEN_REQUIRED');
  }

  const user = await User.findByPk(req.user.id);

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (!user.mfaEnabled) {
    throw new AppError('MFA is not enabled', 400, 'MFA_NOT_ENABLED');
  }

  // Check if token is a backup code (stored as sha256 hashes; single-use)
  const candidateHash = hashBackupCode(token);
  if (Array.isArray(user.mfaBackupCodes) && user.mfaBackupCodes.includes(candidateHash)) {
    // Remove used backup code
    user.mfaBackupCodes = user.mfaBackupCodes.filter(hash => hash !== candidateHash);
    await user.save();

    // Mark MFA as verified in session
    req.session.mfaVerified = true;

    logger.info('MFA validated with backup code', { userId: user.id });

    return res.json({
      message: 'MFA validated successfully with backup code',
      remainingBackupCodes: user.mfaBackupCodes.length
    });
  }

  // Verify TOTP token
  const verified = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token,
    window: 1
  });

  if (!verified) {
    logger.warn('Invalid MFA token attempt', { userId: user.id });
    throw new AppError('Invalid MFA token', 400, 'INVALID_MFA_TOKEN');
  }

  // Mark MFA as verified in session
  req.session.mfaVerified = true;

  logger.info('MFA validated successfully', { userId: user.id });

  res.json({ message: 'MFA validated successfully' });
}));

/**
 * POST /api/mfa/disable
 * Disable MFA for user
 */
router.post('/disable',
  strictLimiter, // 10 req/15min to prevent abuse
  asyncHandler(async (req, res) => {
  const { password } = req.body;

  if (!password) {
    throw new AppError('Password required to disable MFA', 400, 'PASSWORD_REQUIRED');
  }

  const user = await User.findByPk(req.user.id);

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (!user.mfaEnabled) {
    throw new AppError('MFA is not enabled', 400, 'MFA_NOT_ENABLED');
  }

  // Verify password
  const bcrypt = require('bcrypt');
  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    throw new AppError('Invalid password', 401, 'INVALID_PASSWORD');
  }

  // Disable MFA
  user.mfaEnabled = false;
  user.mfaSecret = null;
  user.mfaBackupCodes = null;
  await user.save();

  // Remove MFA verification from session
  req.session.mfaVerified = false;

  // Drop any trusted-device cookie on this device (the mfaSecret rotation already
  // invalidates outstanding ones everywhere; this tidies up the current device).
  trustedDevice.clearTrustedDeviceCookie(res);

  logger.info('MFA disabled', { userId: user.id });

  res.json({ message: 'MFA disabled successfully' });
}));

/**
 * POST /api/mfa/regenerate-backup-codes
 * Regenerate backup codes
 */
router.post('/regenerate-backup-codes',
  strictLimiter, // 10 req/15min to prevent abuse
  asyncHandler(async (req, res) => {
  const { password } = req.body;

  if (!password) {
    throw new AppError('Password required', 400, 'PASSWORD_REQUIRED');
  }

  const user = await User.findByPk(req.user.id);

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (!user.mfaEnabled) {
    throw new AppError('MFA is not enabled', 400, 'MFA_NOT_ENABLED');
  }

  // Verify password
  const bcrypt = require('bcrypt');
  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    throw new AppError('Invalid password', 401, 'INVALID_PASSWORD');
  }

  // Generate new backup codes - only sha256 hashes are persisted
  const backupCodes = generateBackupCodes();

  user.mfaBackupCodes = backupCodes.hashes;
  await user.save();

  logger.info('MFA backup codes regenerated', { userId: user.id });

  res.json({
    message: 'Backup codes regenerated successfully',
    // Shown ONCE - only hashes are stored server-side
    backupCodes: backupCodes.plaintext
  });
}));

/**
 * GET /api/mfa/status
 * Get MFA status for current user
 */
router.get('/status', asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  res.json({
    mfaEnabled: user.mfaEnabled,
    backupCodesRemaining: user.mfaBackupCodes ? user.mfaBackupCodes.length : 0
  });
}));

module.exports = router;
