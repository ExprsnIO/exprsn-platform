/**
 * Tokens Routes
 */

const express = require('express');
const router = express.Router();
const tokensController = require('../controllers/tokens');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rate-limit');
const validation = require('../middleware/validation');

// All routes require authentication
router.use(auth.requireAuth);

// Create token
router.post(
  '/',
  rateLimit.tokenRateLimit,
  validation.validateTokenCreation,
  tokensController.createToken
);

// Validate token
router.post(
  '/validate',
  rateLimit.authenticatedRateLimit,
  tokensController.validateToken
);

// List tokens
router.get(
  '/',
  validation.validatePagination,
  tokensController.listTokens
);

// Get token statistics
router.get(
  '/stats',
  tokensController.getTokenStats
);

// Get token by handle
router.get(
  '/:handle',
  validation.validateTokenHandle,
  tokensController.getToken
);

// Use token
router.post(
  '/:handle/use',
  rateLimit.tokenRateLimit,
  validation.validateTokenHandle,
  auth.tokenUsageLimit,
  tokensController.useToken
);

// Refresh token
router.post(
  '/:handle/refresh',
  rateLimit.tokenRateLimit,
  validation.validateTokenHandle,
  tokensController.refreshToken
);

// Revoke token
router.post(
  '/:handle/revoke',
  rateLimit.strictRateLimit,
  validation.validateTokenHandle,
  tokensController.revokeToken
);

module.exports = router;
