/**
 * Exprsn Live - Health Routes
 */

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'exprsn-live',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

router.get('/ready', (req, res) => {
  res.json({
    ready: true,
    service: 'exprsn-live',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
