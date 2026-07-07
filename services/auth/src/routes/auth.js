/**
 * ═══════════════════════════════════════════════════════════
 * Authentication Routes
 * User registration, login, logout, password reset
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const passport = require('passport');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const { asyncHandler, AppError, logger, validateRequired } = require('@exprsn/shared');
const { strictLimiter } = require('@exprsn/shared');
const { User, Session } = require('../models');
const tokenService = require('../services/tokenService');
const sessionService = require('../services/sessionService');
const mfaPolicyService = require('../services/mfaPolicyService');
const { getEmailService } = require('../services/emailService');
const { validatePasswordOrThrow } = require('../services/passwordService');
const { issueMfaToken, verifyMfaToken, hashBackupCode } = require('../utils/mfaToken');
const { createExchangeCode, consumeExchangeCode } = require('../utils/exchangeCodes');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  validate
} = require('../validators');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register new user
 */
router.post('/register',
  strictLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
  const { email, password, displayName } = req.body;

  // Validate required fields
  validateRequired({ email, password }, ['email', 'password']);

  // Full password policy (length, character classes, common/sequential patterns)
  validatePasswordOrThrow(password);

  // Check if user exists
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new AppError('Email already registered', 409, 'USER_EXISTS');
  }

  // Create user
  const user = await User.create({
    email,
    passwordHash: password, // Will be hashed by beforeCreate hook
    displayName,
    emailVerificationToken: crypto.randomBytes(32).toString('hex')
  });

  logger.info('User registered', { userId: user.id, email: user.email });

  // Emit onto the plugin hook bus (fire-and-forget, best-effort, guarded).
  try {
    const pluginHost = require('../../../plugins/src/services/pluginHost');
    pluginHost.emit('auth.user.registered', {
      module: 'auth', userId: user.id,
      user: { id: user.id, email: user.email, name: user.displayName },
    }).catch(() => {});
  } catch (_) { /* plugins module unavailable — ignore */ }

  // Send verification email
  try {
    const emailService = await getEmailService();
    await emailService.sendVerificationEmail(user, user.emailVerificationToken);
  } catch (error) {
    logger.error('Failed to send verification email', {
      userId: user.id,
      error: error.message
    });
    // Don't fail registration if email fails
  }

  // Send welcome email
  try {
    const emailService = await getEmailService();
    await emailService.sendWelcomeEmail(user);
  } catch (error) {
    logger.error('Failed to send welcome email', {
      userId: user.id,
      error: error.message
    });
    // Don't fail registration if email fails
  }

  // Generate CA token
  const token = await tokenService.generateToken(user);

  // Persist a session row for the bearer issued on registration (best-effort —
  // a session-row write must never fail an otherwise-successful registration).
  try {
    await sessionService.recordSession(req, user, token);
  } catch (sessionErr) {
    logger.error('Failed to record session on register', { userId: user.id, error: sessionErr.message });
  }

  res.status(201).json({
    message: 'User registered successfully. Please check your email to verify your account.',
    user: user.toSafeObject(),
    token
  });
}));

/**
 * POST /api/auth/login
 * User login
 */
router.post('/login',
  strictLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res, next) => {
  passport.authenticate('local', async (err, user, info) => {
    // This callback runs async and is NOT awaited by passport, so a thrown
    // error here becomes an unhandledRejection that crashes the process. Route
    // every failure through next() instead.
    try {
      if (err) {
        return next(err);
      }

      if (!user) {
        return next(new AppError(info && info.message ? info.message : 'Authentication failed', 401, 'AUTH_FAILED'));
      }

      // MFA gate: when MFA is enabled, do NOT establish a session or issue the
      // real token. Return a short-lived MFA pending token instead - the client
      // must complete POST /api/auth/mfa/verify with a TOTP/backup code.
      if (user.mfaEnabled) {
        logger.info('Login pending MFA verification', { userId: user.id, email: user.email });

        return res.json({
          mfaRequired: true,
          mfaToken: issueMfaToken(user)
        });
      }

      // Org 2FA policy enforcement for users who have NOT enrolled (STATUS.md #12).
      // Resolve the most-restrictive policy across the user's orgs. If enrollment
      // is required and the grace window has elapsed, HARD-gate: establish the
      // passport session (so the client can run the setup wizard) but withhold the
      // bearer until MFA is actually enabled. Within grace, issue the token but
      // flag the pending requirement so the SPA can nudge. Fail OPEN on a
      // resolution error (defense-in-depth control; a DB blip must not block all
      // logins) — logged loudly.
      let softEnrollment = null;
      try {
        const decision = await mfaPolicyService.evaluateForLogin(user);
        if (decision.required && decision.enrollmentRequired) {
          if (decision.graceExpired) {
            return req.login(user, (loginErr) => {
              if (loginErr) return next(loginErr);
              if (req.session) req.session.mfaVerified = false;
              logger.info('Login blocked pending MFA enrollment (org policy)', { userId: user.id, email: user.email });
              return res.json({
                mfaEnrollmentRequired: true,
                enforced: true,
                allowedMethods: decision.allowedMethods,
                message: 'Your organization requires two-factor authentication. Set it up to continue.'
              });
            });
          }
          softEnrollment = {
            allowedMethods: decision.allowedMethods,
            graceEndsAt: decision.graceEndsAt
          };
        }
      } catch (policyErr) {
        logger.error('MFA policy resolution failed; allowing login', { userId: user.id, error: policyErr.message });
      }

      // Log user in
      req.login(user, async (loginErr) => {
        try {
          if (loginErr) {
            return next(loginErr);
          }

          logger.info('User logged in', { userId: user.id, email: user.email });

          // Generate CA token
          const token = await tokenService.generateToken(user);

          // Persist a session row (best-effort — never fail a valid login on it).
          try {
            await sessionService.recordSession(req, user, token);
          } catch (sessionErr) {
            logger.error('Failed to record session on login', { userId: user.id, error: sessionErr.message });
          }

          const safeUser = user.toSafeObject();
          safeUser.roles = await tokenService.resolveUserRoles(user);
          const body = {
            message: 'Login successful',
            user: safeUser,
            token
          };
          if (softEnrollment) {
            // Within the enrollment grace window — login succeeds, SPA can prompt.
            body.mfaEnrollmentRequired = true;
            body.enforced = false;
            body.allowedMethods = softEnrollment.allowedMethods;
            body.mfaEnrollmentGraceEndsAt = softEnrollment.graceEndsAt;
          }
          res.json(body);
        } catch (loginCbErr) {
          next(loginCbErr);
        }
      });
    } catch (cbErr) {
      next(cbErr);
    }
  })(req, res, next);
}));

/**
 * POST /api/auth/mfa/verify
 * Complete an MFA-gated login: exchange a pending mfaToken + TOTP code
 * (or backup code) for a session and the real auth token.
 */
router.post('/mfa/verify',
  strictLimiter,
  asyncHandler(async (req, res, next) => {
  const { mfaToken, code } = req.body;

  validateRequired({ mfaToken, code }, ['mfaToken', 'code']);

  let decoded;
  try {
    decoded = verifyMfaToken(mfaToken);
  } catch (error) {
    throw new AppError('Invalid or expired MFA token', 401, 'INVALID_MFA_TOKEN');
  }

  const user = await User.findByPk(decoded.sub);

  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    throw new AppError('Invalid or expired MFA token', 401, 'INVALID_MFA_TOKEN');
  }

  // Verify TOTP code (window <= 1)
  let verified = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token: String(code),
    window: 1
  });

  // Fall back to backup codes (stored as sha256 hashes; used codes deleted)
  if (!verified && Array.isArray(user.mfaBackupCodes)) {
    const candidateHash = hashBackupCode(code);
    if (user.mfaBackupCodes.includes(candidateHash)) {
      user.mfaBackupCodes = user.mfaBackupCodes.filter(h => h !== candidateHash);
      verified = true;
      logger.info('MFA login completed with backup code', { userId: user.id });
    }
  }

  if (!verified) {
    logger.warn('Invalid MFA code during login', { userId: user.id });
    throw new AppError('Invalid MFA code', 401, 'INVALID_MFA_CODE');
  }

  user.lastLoginAt = Date.now();
  await user.save();

  req.login(user, async (err) => {
    // Async req.login callback — route errors through next() so a token-mint
    // failure can't surface as a process-killing unhandledRejection.
    try {
      if (err) {
        return next(err);
      }

      req.session.mfaVerified = true;

      logger.info('User logged in (MFA verified)', { userId: user.id, email: user.email });

      const token = await tokenService.generateToken(user);

      // Persist a session row (best-effort — never fail a valid login on it).
      try {
        await sessionService.recordSession(req, user, token);
      } catch (sessionErr) {
        logger.error('Failed to record session on MFA login', { userId: user.id, error: sessionErr.message });
      }

      res.json({
        message: 'Login successful',
        user: user.toSafeObject(),
        token
      });
    } catch (mfaCbErr) {
      next(mfaCbErr);
    }
  });
}));

/**
 * POST /api/auth/exchange
 * Swap a one-time exchange code (issued by OAuth/SAML browser callbacks)
 * for the real auth token. Codes are single-use and expire after 60s.
 */
router.post('/exchange',
  strictLimiter,
  asyncHandler(async (req, res) => {
  const { code } = req.body;

  validateRequired({ code }, ['code']);

  const token = consumeExchangeCode(code);

  if (!token) {
    throw new AppError('Invalid or expired exchange code', 400, 'INVALID_EXCHANGE_CODE');
  }

  res.json({ token });
}));

/**
 * POST /api/auth/logout
 * User logout
 */
router.post('/logout', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new AppError('Not authenticated', 401, 'NOT_AUTHENTICATED');
  }

  const userId = req.user.id;

  // Revoke + deactivate the current session's CA token so the bearer can't be
  // reused after logout (best-effort — never block logout on this). Identify the
  // current session by the presented bearer, else the cookie session id.
  try {
    const where = { userId, active: true };
    if (req.bearerTokenId) where.caTokenId = req.bearerTokenId;
    else if (req.sessionID) where.sessionId = req.sessionID;

    const current = await Session.findOne({ where });
    if (current) {
      if (current.caTokenId) {
        await tokenService.revokeToken(current.caTokenId, 'User logout');
      }
      current.active = false;
      await current.save();
    }
  } catch (revokeErr) {
    logger.error('Logout session/token revoke failed', { userId, error: revokeErr.message });
  }

  req.logout((err) => {
    if (err) {
      logger.error('Logout error', { error: err.message, userId });
      throw new AppError('Logout failed', 500, 'LOGOUT_FAILED');
    }

    logger.info('User logged out', { userId });

    res.json({ message: 'Logout successful' });
  });
}));

/**
 * POST /api/auth/forgot-password
 * Initiate password reset
 */
router.post('/forgot-password',
  strictLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
  const { email } = req.body;

  validateRequired({ email }, ['email']);

  const user = await User.findOne({ where: { email } });

  // Don't reveal if user exists
  if (!user) {
    return res.json({
      message: 'If the email exists, a password reset link has been sent'
    });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
  await user.save();

  logger.info('Password reset requested', { userId: user.id, email: user.email });

  // Send password reset email
  try {
    const emailService = await getEmailService();
    await emailService.sendPasswordResetEmail(user, resetToken);
  } catch (error) {
    logger.error('Failed to send password reset email', {
      userId: user.id,
      error: error.message
    });
    // Don't reveal if email failed for security
  }

  res.json({
    message: 'If the email exists, a password reset link has been sent',
    ...(process.env.NODE_ENV === 'development' && { resetToken }) // Only in dev
  });
}));

/**
 * POST /api/auth/reset-password
 * Complete password reset
 */
router.post('/reset-password',
  strictLimiter,
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  validateRequired({ token, password }, ['token', 'password']);

  // Full password policy (length, character classes, common/sequential patterns)
  validatePasswordOrThrow(password);

  // Find user with valid reset token
  const user = await User.findOne({
    where: {
      resetPasswordToken: token,
      resetPasswordExpires: { [require('sequelize').Op.gt]: Date.now() }
    }
  });

  if (!user) {
    throw new AppError('Invalid or expired reset token', 400, 'INVALID_TOKEN');
  }

  // Update password
  user.passwordHash = password; // Will be hashed by beforeUpdate hook
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  await user.save();

  logger.info('Password reset completed', { userId: user.id, email: user.email });

  res.json({ message: 'Password reset successful' });
}));

/**
 * Shared handler for social (Google/GitHub) OAuth callbacks.
 *
 * - MFA enabled: never issue the real token - redirect with a short-lived
 *   mfaToken (mfa_required=true) so the frontend completes
 *   POST /api/auth/mfa/verify.
 * - Otherwise: the real token is NEVER placed in the redirect URL; a 60s
 *   single-use exchange code is sent instead, swapped via
 *   POST /api/auth/exchange.
 */
async function handleSocialCallback(req, res) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const redirectUrl = new URL('/sso/callback', frontendUrl);

  if (req.user.mfaEnabled) {
    // Session exists from passport, but mark MFA as unverified and do not
    // issue the real token until MFA completes
    if (req.session) {
      req.session.mfaVerified = false;
    }

    redirectUrl.searchParams.set('mfa_required', 'true');
    redirectUrl.searchParams.set('mfaToken', issueMfaToken(req.user));
    return res.redirect(redirectUrl.toString());
  }

  // Org 2FA enforcement for un-enrolled social logins (close the OAuth bypass of
  // the /login gate, STATUS.md #12). The passport session is already established,
  // so send the user to the SPA login page to complete enrolment (setup → verify
  // → re-mint) before any bearer is issued. Fail open on resolution error.
  try {
    const decision = await mfaPolicyService.evaluateForLogin(req.user);
    if (decision.required && decision.enrollmentRequired && decision.graceExpired) {
      if (req.session) req.session.mfaVerified = false;
      const enrollUrl = new URL('/login', frontendUrl);
      enrollUrl.searchParams.set('enroll', 'mfa');
      logger.info('Social login requires MFA enrollment (org policy)', { userId: req.user.id });
      return res.redirect(enrollUrl.toString());
    }
  } catch (policyErr) {
    logger.error('MFA policy resolution failed on social login; allowing', { userId: req.user.id, error: policyErr.message });
  }

  // Generate CA token, hand out a one-time exchange code (not the token)
  const token = await tokenService.generateToken(req.user);

  // Persist a session row for the OAuth login (best-effort).
  try {
    await sessionService.recordSession(req, req.user, token);
  } catch (sessionErr) {
    logger.error('Failed to record session on social login', { userId: req.user.id, error: sessionErr.message });
  }

  const exchangeCode = createExchangeCode(token);

  redirectUrl.searchParams.set('code', exchangeCode);
  res.redirect(redirectUrl.toString());
}

/**
 * Google OAuth
 */
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  asyncHandler(handleSocialCallback)
);

/**
 * GitHub OAuth
 */
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));

router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  asyncHandler(handleSocialCallback)
);

/**
 * POST /api/auth/verify-email
 * Verify email address with token
 */
router.post('/verify-email',
  validate(verifyEmailSchema),
  asyncHandler(async (req, res) => {
  const { token } = req.body;

  validateRequired({ token }, ['token']);

  const user = await User.findOne({
    where: { emailVerificationToken: token }
  });

  if (!user) {
    throw new AppError('Invalid or expired verification token', 400, 'INVALID_TOKEN');
  }

  // Mark email as verified
  user.emailVerified = true;
  user.emailVerificationToken = null;
  await user.save();

  logger.info('Email verified', { userId: user.id, email: user.email });

  res.json({ message: 'Email verified successfully' });
}));

/**
 * POST /api/auth/resend-verification
 * Resend email verification
 */
router.post('/resend-verification',
  strictLimiter,
  validate(resendVerificationSchema),
  asyncHandler(async (req, res) => {
  const { email } = req.body;

  validateRequired({ email }, ['email']);

  const user = await User.findOne({ where: { email } });

  // Don't reveal if user exists
  if (!user) {
    return res.json({
      message: 'If the email exists and is not verified, a verification link has been sent'
    });
  }

  if (user.emailVerified) {
    return res.json({ message: 'Email is already verified' });
  }

  // Generate new verification token
  user.emailVerificationToken = crypto.randomBytes(32).toString('hex');
  await user.save();

  logger.info('Email verification resent', { userId: user.id, email: user.email });

  // Send verification email
  try {
    const emailService = await getEmailService();
    await emailService.sendVerificationEmail(user, user.emailVerificationToken);
  } catch (error) {
    logger.error('Failed to send verification email', {
      userId: user.id,
      error: error.message
    });
    // Don't reveal if email failed for security
  }

  res.json({
    message: 'If the email exists and is not verified, a verification link has been sent',
    ...(process.env.NODE_ENV === 'development' && { token: user.emailVerificationToken }) // Only in dev
  });
}));

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
router.post('/change-password',
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
  }

  const { currentPassword, newPassword } = req.body;

  validateRequired({ currentPassword, newPassword }, ['currentPassword', 'newPassword']);

  // Full password policy (length, character classes, common/sequential patterns)
  validatePasswordOrThrow(newPassword);

  const user = await User.findByPk(req.user.id);

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  // Verify current password
  const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);

  if (!isValidPassword) {
    throw new AppError('Current password is incorrect', 401, 'INVALID_PASSWORD');
  }

  // Check if new password is same as current
  const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);

  if (isSamePassword) {
    throw new AppError('New password must be different from current password', 400, 'SAME_PASSWORD');
  }

  // Update password
  user.passwordHash = newPassword; // Will be hashed by beforeUpdate hook
  await user.save();

  logger.info('Password changed', { userId: user.id, email: user.email });

  // Send security alert email
  try {
    const emailService = await getEmailService();
    await emailService.sendSecurityAlertEmail(user, {
      type: 'Password Changed',
      description: 'Your password was successfully changed.',
      timestamp: Date.now(),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      location: 'Unknown' // Could integrate with IP geolocation service
    });
  } catch (error) {
    logger.error('Failed to send security alert email', {
      userId: user.id,
      error: error.message
    });
    // Don't fail the operation if email fails
  }

  res.json({ message: 'Password changed successfully' });
}));

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new AppError('Not authenticated', 401, 'NOT_AUTHENTICATED');
  }

  const user = await User.findByPk(req.user.id, {
    include: [{ model: require('../models').Group, as: 'groups' }]
  });

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const safeUser = user.toSafeObject();
  safeUser.roles = await tokenService.resolveUserRoles(user);
  res.json({ user: safeUser });
}));

/**
 * POST /api/auth/token
 * Re-mint a bearer (CA) token from the current passport session. Lets a
 * first-party SPA recover its bearer after a hard reload (the bearer is kept in
 * memory, not persisted) without re-entering credentials — the httpOnly session
 * cookie is the source of truth. MFA users must have a fully verified session.
 */
router.post('/token', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new AppError('Not authenticated', 401, 'NOT_AUTHENTICATED');
  }

  // If MFA is enabled, only mint once MFA has been completed for this session.
  if (req.user.mfaEnabled && req.session && req.session.mfaVerified === false) {
    throw new AppError('MFA verification required', 401, 'MFA_REQUIRED');
  }

  const user = await User.findByPk(req.user.id);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  // Close the enrollment bypass: a hard-gated login establishes the session but
  // withholds the bearer, so re-mint must apply the same org-policy check — else
  // an un-enrolled user could just call this to obtain a bearer (STATUS.md #12).
  if (!user.mfaEnabled) {
    const decision = await mfaPolicyService.evaluateForLogin(user);
    if (decision.required && decision.enrollmentRequired && decision.graceExpired) {
      throw new AppError('Your organization requires two-factor authentication. Set it up to continue.', 403, 'MFA_ENROLLMENT_REQUIRED');
    }
  }

  const token = await tokenService.generateToken(user);

  // Re-mint on the same passport session: recordSession upserts by sessionId, so
  // this refreshes the existing row's caTokenId in place (no duplicate per reload).
  try {
    await sessionService.recordSession(req, user, token);
  } catch (sessionErr) {
    logger.error('Failed to record session on token re-mint', { userId: user.id, error: sessionErr.message });
  }

  const safeUser = user.toSafeObject();
  safeUser.roles = await tokenService.resolveUserRoles(user);
  res.json({ token, user: safeUser });
}));

module.exports = router;
