/**
 * CRL (Certificate Revocation List) Routes
 */

const express = require('express');
const router = express.Router();
const crlController = require('../controllers/crl');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rate-limit');
const validation = require('../middleware/validation');

// Public CRL endpoints (no auth required)
router.get('/crl.pem', rateLimit.publicRateLimit, crlController.getCRL);

router.get('/info', rateLimit.publicRateLimit, crlController.getCRLInfo);

router.get(
  '/check/:serial',
  rateLimit.publicRateLimit,
  validation.validateCertificateSerial,
  crlController.checkCertificateInCRL
);

// Protected endpoints
router.get(
  '/revoked',
  auth.optionalAuth,
  validation.validatePagination,
  crlController.listRevokedCertificates
);

// Admin endpoints
router.post(
  '/regenerate',
  auth.requireAuth,
  auth.requireRoles('admin'),
  rateLimit.strictRateLimit,
  crlController.regenerateCRL
);

module.exports = router;
