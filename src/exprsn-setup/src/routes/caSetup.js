/**
 * ═══════════════════════════════════════════════════════════
 * CA Setup Routes
 * API endpoints for Certificate Authority setup and configuration
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const envManager = require('../utils/envManager');

const CA_SERVICE_URL = process.env.CA_SERVICE_URL || 'http://localhost:3000';
const SERVICE_NAME = 'exprsn-ca';

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
        console.error('Error fetching CA stats:', error.message);
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
    console.error('Error checking CA status:', error);
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
    // Read .env file
    const env = await envManager.read(SERVICE_NAME);

    // Parse configuration
    const config = {
      ca: {
        organizationName: env.CA_ORG_NAME || env.ROOT_CA_ORG || '',
        commonName: env.CA_COMMON_NAME || env.ROOT_CA_CN || '',
        keySize: parseInt(env.CA_KEY_SIZE || env.ROOT_CA_KEY_SIZE || '4096'),
        validity: parseInt(env.CA_VALIDITY_DAYS || env.ROOT_CA_VALIDITY || '7300'),
        serialNumber: env.CA_SERIAL_NUMBER || ''
      },
      ocsp: {
        enabled: env.OCSP_ENABLED !== 'false',
        port: parseInt(env.OCSP_PORT || '2560'),
        url: env.OCSP_URL || `http://ocsp.exprsn.local:${env.OCSP_PORT || '2560'}`
      },
      crl: {
        enabled: env.CRL_ENABLED !== 'false',
        interval: parseInt(env.CRL_UPDATE_INTERVAL || '24'),
        distributionPoints: env.CRL_DISTRIBUTION_POINTS || 'http://crl.exprsn.local/ca.crl'
      },
      storage: {
        type: env.STORAGE_TYPE || 'database',
        backup: env.STORAGE_BACKUP === 'true'
      },
      security: {
        minKeySize: parseInt(env.MIN_KEY_SIZE || '2048'),
        defaultValidity: parseInt(env.DEFAULT_CERT_VALIDITY || '365'),
        signatureAlgorithm: env.SIGNATURE_ALGORITHM || 'RSA-SHA256-PSS',
        autoRenewal: env.AUTO_RENEWAL !== 'false'
      }
    };

    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Error getting configuration:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Initialize CA
 */
router.post('/initialize', async (req, res) => {
  try {
    const {
      organizationName,
      commonName,
      country,
      state,
      locality,
      organizationalUnit,
      keySize,
      validityDays,
      enableOCSP,
      enableCRL
    } = req.body;

    // Validate required fields
    if (!organizationName || !commonName) {
      return res.status(400).json({
        success: false,
        error: 'Organization name and common name are required'
      });
    }

    // Update .env file with CA configuration
    const envUpdates = {
      CA_ORG_NAME: organizationName,
      CA_COMMON_NAME: commonName,
      CA_COUNTRY: country || 'US',
      CA_STATE: state || '',
      CA_LOCALITY: locality || '',
      CA_ORG_UNIT: organizationalUnit || '',
      CA_KEY_SIZE: keySize.toString(),
      CA_VALIDITY_DAYS: validityDays.toString(),
      OCSP_ENABLED: enableOCSP ? 'true' : 'false',
      CRL_ENABLED: enableCRL ? 'true' : 'false'
    };

    await envManager.update(SERVICE_NAME, envUpdates);

    // Call CA service to generate root certificate
    try {
      const initResponse = await axios.post(
        `${CA_SERVICE_URL}/api/certificates/generate-root`,
        {
          commonName,
          organizationName,
          country,
          state,
          locality,
          organizationalUnit,
          keySize,
          validityDays
        },
        { timeout: 30000 }
      );

      if (initResponse.data && initResponse.data.success) {
        // Emit socket event
        if (req.app.get('io')) {
          req.app.get('io').emit('ca:initialized', {
            timestamp: new Date().toISOString(),
            certificate: initResponse.data.certificate
          });
        }

        res.json({
          success: true,
          message: 'CA initialized successfully',
          certificate: initResponse.data.certificate
        });
      } else {
        throw new Error(initResponse.data?.message || 'Failed to initialize CA');
      }
    } catch (error) {
      console.error('Error calling CA service:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to initialize CA: ' + error.message
      });
    }
  } catch (error) {
    console.error('Error initializing CA:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update Root CA configuration
 */
router.post('/config/root-ca', async (req, res) => {
  try {
    const { organizationName, commonName, keySize, validityDays } = req.body;

    const envUpdates = {
      CA_ORG_NAME: organizationName,
      CA_COMMON_NAME: commonName,
      CA_KEY_SIZE: keySize.toString(),
      CA_VALIDITY_DAYS: validityDays.toString()
    };

    await envManager.update(SERVICE_NAME, envUpdates);

    // Emit socket event
    if (req.app.get('io')) {
      req.app.get('io').emit('ca:config-updated', {
        section: 'root-ca',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Root CA configuration updated',
      updated: Object.keys(envUpdates)
    });
  } catch (error) {
    console.error('Error updating Root CA config:', error);
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

    const envUpdates = {
      OCSP_ENABLED: enabled ? 'true' : 'false',
      OCSP_PORT: port.toString(),
      OCSP_URL: url
    };

    await envManager.update(SERVICE_NAME, envUpdates);

    // Emit socket event
    if (req.app.get('io')) {
      req.app.get('io').emit('ca:config-updated', {
        section: 'ocsp',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'OCSP configuration updated',
      updated: Object.keys(envUpdates)
    });
  } catch (error) {
    console.error('Error updating OCSP config:', error);
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

    const envUpdates = {
      CRL_ENABLED: enabled ? 'true' : 'false',
      CRL_UPDATE_INTERVAL: interval.toString(),
      CRL_DISTRIBUTION_POINTS: distributionPoints
    };

    await envManager.update(SERVICE_NAME, envUpdates);

    // Emit socket event
    if (req.app.get('io')) {
      req.app.get('io').emit('ca:config-updated', {
        section: 'crl',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'CRL configuration updated',
      updated: Object.keys(envUpdates)
    });
  } catch (error) {
    console.error('Error updating CRL config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update Storage configuration
 */
router.post('/config/storage', async (req, res) => {
  try {
    const { type, backup } = req.body;

    const envUpdates = {
      STORAGE_TYPE: type,
      STORAGE_BACKUP: backup ? 'true' : 'false'
    };

    await envManager.update(SERVICE_NAME, envUpdates);

    // Emit socket event
    if (req.app.get('io')) {
      req.app.get('io').emit('ca:config-updated', {
        section: 'storage',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Storage configuration updated',
      updated: Object.keys(envUpdates)
    });
  } catch (error) {
    console.error('Error updating Storage config:', error);
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

    const envUpdates = {
      MIN_KEY_SIZE: minKeySize.toString(),
      DEFAULT_CERT_VALIDITY: defaultValidity.toString(),
      SIGNATURE_ALGORITHM: signatureAlgorithm,
      AUTO_RENEWAL: autoRenewal ? 'true' : 'false'
    };

    await envManager.update(SERVICE_NAME, envUpdates);

    // Emit socket event
    if (req.app.get('io')) {
      req.app.get('io').emit('ca:config-updated', {
        section: 'security',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Security configuration updated',
      updated: Object.keys(envUpdates)
    });
  } catch (error) {
    console.error('Error updating Security config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get recent logs
 */
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    // Try to fetch logs from CA service
    try {
      const logsResponse = await axios.get(
        `${CA_SERVICE_URL}/api/logs?limit=${limit}`,
        { timeout: 5000 }
      );

      if (logsResponse.data && logsResponse.data.logs) {
        return res.json({
          success: true,
          logs: logsResponse.data.logs
        });
      }
    } catch (error) {
      console.error('Error fetching logs from CA service:', error.message);
    }

    // Return empty logs if service is unavailable
    res.json({
      success: true,
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'CA service logs unavailable'
        }
      ]
    });
  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      logs: []
    });
  }
});

/**
 * Backup .env file
 */
router.post('/backup', async (req, res) => {
  try {
    const result = await envManager.backup(SERVICE_NAME);

    res.json(result);
  } catch (error) {
    console.error('Error creating backup:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get all environment variables (for debugging)
 */
router.get('/env', async (req, res) => {
  try {
    const env = await envManager.read(SERVICE_NAME);

    // Mask sensitive values
    const maskedEnv = {};
    for (const [key, value] of Object.entries(env)) {
      if (key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('password') ||
          key.toLowerCase().includes('key')) {
        maskedEnv[key] = '***REDACTED***';
      } else {
        maskedEnv[key] = value;
      }
    }

    res.json({
      success: true,
      env: maskedEnv
    });
  } catch (error) {
    console.error('Error reading env file:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
