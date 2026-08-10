/**
 * OCSP (Online Certificate Status Protocol) Routes
 */

const express = require('express');
const router = express.Router();
const ocspController = require('../controllers/ocsp');
const rateLimit = require('../middleware/rate-limit');
const validation = require('../middleware/validation');

// OCSP responder endpoint (no auth required - public service)
router.get('/*', rateLimit.publicRateLimit, ocspController.handleOCSPRequest);
router.post('/', rateLimit.publicRateLimit, ocspController.handleOCSPRequest);

// OCSP info endpoint
router.get('/info', ocspController.getOCSPInfo);

// Check certificate status by serial (JSON API)
router.get(
  '/status/:serial',
  validation.validateCertificateSerial,
  ocspController.checkCertificateStatus
);

module.exports = router;
