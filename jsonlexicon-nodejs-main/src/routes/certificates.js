/**
 * Certificates Routes
 */

const express = require('express');
const router = express.Router();
const certificatesController = require('../controllers/certificates');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rate-limit');
const validation = require('../middleware/validation');

// All routes require authentication
router.use(auth.requireAuth);

// Create certificate
router.post(
  '/',
  rateLimit.certificateRateLimit,
  validation.validateCertificateRequest,
  certificatesController.createCertificate
);

// List certificates
router.get(
  '/',
  validation.validatePagination,
  certificatesController.listCertificates
);

// Get certificate statistics
router.get(
  '/stats',
  certificatesController.getCertificateStats
);

// Validate certificate
router.post(
  '/validate',
  rateLimit.authenticatedRateLimit,
  certificatesController.validateCertificate
);

// Get certificate by serial
router.get(
  '/:serial',
  validation.validateCertificateSerial,
  certificatesController.getCertificate
);

// Download certificate
router.get(
  '/:serial/download',
  validation.validateCertificateSerial,
  certificatesController.downloadCertificate
);

// Get certificate chain
router.get(
  '/:serial/chain',
  validation.validateCertificateSerial,
  certificatesController.getCertificateChain
);

// Revoke certificate
router.post(
  '/:serial/revoke',
  rateLimit.strictRateLimit,
  validation.validateCertificateSerial,
  certificatesController.revokeCertificate
);

module.exports = router;
