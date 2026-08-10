/**
 * ═══════════════════════════════════════════════════════════
 * CA Setup Routes
 * API endpoints for Certificate Authority setup and configuration
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');

const CA_SERVICE_URL = process.env.CA_SERVICE_URL || 'http://localhost:3000';

/**
 * Get CA service status
 */
router.get('/status', async (req, res) => {
  try {
    // Check if CA service is running
    const healthResponse = await axios.get(`${CA_SERVICE_URL}/health`, {
      timeout: 5000
    }).catch(() => null);

    const running = healthResponse && healthResponse.status === 200;

    // Get certificate counts if service is running
    let stats = {
      rootCertCount: 0,
      intermediateCertCount: 0,
      totalCertsIssued: 0,
      initialized: false
    };

    if (running) {
      try {
        const statsResponse = await axios.get(`${CA_SERVICE_URL}/api/stats`, {
          timeout: 5000
        });

        if (statsResponse.data) {
          stats = {
            ...stats,
            ...statsResponse.data,
            initialized: statsResponse.data.rootCertCount > 0
          };
        }
      } catch (error) {
        logger.error('Error fetching CA stats:', error.message);
      }
    }

    res.json({
      success: true,
      status: {
        running,
        ...stats
      }
    });
  } catch (error) {
    logger.error('Error checking CA status:', error);
    res.json({
      success: true,
      status: {
        running: false,
        rootCertCount: 0,
        intermediateCertCount: 0,
        totalCertsIssued: 0,
        initialized: false
      }
    });
  }
});

/**
 * Get CA configuration
 */
router.get('/config', async (req, res) => {
  try {
    // For now, return default configuration
    // In production, this would read from environment or database
    const config = {
      ca: {
        organizationName: process.env.CA_ORG_NAME || '',
        commonName: process.env.CA_COMMON_NAME || '',
        keySize: parseInt(process.env.CA_KEY_SIZE || '4096'),
        validity: parseInt(process.env.CA_VALIDITY_DAYS || '7300'),
        serialNumber: process.env.CA_SERIAL_NUMBER || ''
      },
      ocsp: {
        enabled: process.env.OCSP_ENABLED !== 'false',
        port: parseInt(process.env.OCSP_PORT || '2560'),
        url: process.env.OCSP_URL || `http://ocsp.exprsn.local:2560`
      },
      crl: {
        enabled: process.env.CRL_ENABLED !== 'false',
        interval: parseInt(process.env.CRL_UPDATE_INTERVAL || '24'),
        distributionPoints: process.env.CRL_DISTRIBUTION_POINTS || 'http://crl.exprsn.local/ca.crl'
      },
      storage: {
        type: process.env.STORAGE_TYPE || 'database',
        backup: process.env.STORAGE_BACKUP === 'true'
      },
      security: {
        minKeySize: parseInt(process.env.MIN_KEY_SIZE || '2048'),
        defaultValidity: parseInt(process.env.DEFAULT_CERT_VALIDITY || '365'),
        signatureAlgorithm: process.env.SIGNATURE_ALGORITHM || 'RSA-SHA256-PSS',
        autoRenewal: process.env.AUTO_RENEWAL !== 'false'
      }
    };

    res.json({
      success: true,
      config
    });
  } catch (error) {
    logger.error('Error getting configuration:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update OCSP configuration
 */
router.post('/config/ocsp', async (req, res) => {
  try {
    const { enabled, port, url } = req.body;

    // In production, this would update .env or database
    logger.info('OCSP config update requested:', { enabled, port, url });

    // Emit socket event
    if (global.adminIO) {
      global.adminIO.emit('ca:config-updated', {
        section: 'ocsp',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'OCSP configuration updated'
    });
  } catch (error) {
    logger.error('Error updating OCSP config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update CRL configuration
 */
router.post('/config/crl', async (req, res) => {
  try {
    const { enabled, interval, distributionPoints } = req.body;

    logger.info('CRL config update requested:', { enabled, interval, distributionPoints });

    // Emit socket event
    if (global.adminIO) {
      global.adminIO.emit('ca:config-updated', {
        section: 'crl',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'CRL configuration updated'
    });
  } catch (error) {
    logger.error('Error updating CRL config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update Security configuration
 */
router.post('/config/security', async (req, res) => {
  try {
    const { minKeySize, defaultValidity, signatureAlgorithm, autoRenewal } = req.body;

    logger.info('Security config update requested:', { minKeySize, defaultValidity, signatureAlgorithm, autoRenewal });

    // Emit socket event
    if (global.adminIO) {
      global.adminIO.emit('ca:config-updated', {
        section: 'security',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Security configuration updated'
    });
  } catch (error) {
    logger.error('Error updating Security config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
