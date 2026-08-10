/**
 * TLS Certificate Management
 * Handles SSL/TLS certificate generation and loading
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { logger } = require('@exprsn/shared');

const CERT_DIR = path.join(__dirname, '../../certs');
const CERT_PATH = path.join(CERT_DIR, 'server.crt');
const KEY_PATH = path.join(CERT_DIR, 'server.key');

/**
 * Ensure certificates directory exists
 */
function ensureCertDirectory() {
  if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
    logger.info('Created certificates directory', { path: CERT_DIR });
  }
}

/**
 * Generate self-signed certificate for localhost
 */
function generateSelfSignedCertificate() {
  try {
    logger.info('Generating self-signed SSL certificate for localhost...');

    ensureCertDirectory();

    // OpenSSL command to generate self-signed certificate
    const opensslCmd = `openssl req -x509 -newkey rsa:4096 -nodes \
      -keyout "${KEY_PATH}" \
      -out "${CERT_PATH}" \
      -days 365 \
      -subj "/C=US/ST=State/L=City/O=Exprsn/OU=DB Admin/CN=localhost" \
      -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:::1"`;

    execSync(opensslCmd, { stdio: 'pipe' });

    // Set proper permissions
    fs.chmodSync(KEY_PATH, 0o600);
    fs.chmodSync(CERT_PATH, 0o644);

    logger.info('Self-signed SSL certificate generated successfully', {
      cert: CERT_PATH,
      key: KEY_PATH,
      validFor: '365 days'
    });

    return true;
  } catch (error) {
    logger.error('Failed to generate self-signed certificate', {
      error: error.message,
      stack: error.stack
    });
    return false;
  }
}

/**
 * Check if certificates exist and are valid
 */
function certificatesExist() {
  const certExists = fs.existsSync(CERT_PATH);
  const keyExists = fs.existsSync(KEY_PATH);

  if (certExists && keyExists) {
    // Check if certificate is still valid
    try {
      const certInfo = execSync(`openssl x509 -in "${CERT_PATH}" -noout -checkend 86400`, {
        stdio: 'pipe'
      });
      return true;
    } catch (error) {
      // Certificate expired or invalid
      logger.warn('SSL certificate expired or invalid, will regenerate');
      return false;
    }
  }

  return false;
}

/**
 * Get TLS options for HTTPS server
 * @returns {Object|null} TLS options or null if TLS should be disabled
 */
function getTLSOptions() {
  // Check environment variables for custom certificates
  const customCertPath = process.env.TLS_CERT_PATH;
  const customKeyPath = process.env.TLS_KEY_PATH;
  const tlsEnabled = process.env.TLS_ENABLED !== 'false'; // Default to true

  if (!tlsEnabled) {
    logger.info('TLS explicitly disabled via TLS_ENABLED=false');
    return null;
  }

  // Use custom certificates if provided
  if (customCertPath && customKeyPath) {
    if (fs.existsSync(customCertPath) && fs.existsSync(customKeyPath)) {
      logger.info('Using custom SSL certificates', {
        cert: customCertPath,
        key: customKeyPath
      });

      try {
        return {
          cert: fs.readFileSync(customCertPath),
          key: fs.readFileSync(customKeyPath),
          // Optional CA certificate
          ...(process.env.TLS_CA_PATH && fs.existsSync(process.env.TLS_CA_PATH) && {
            ca: fs.readFileSync(process.env.TLS_CA_PATH)
          }),
          // TLS version settings
          minVersion: process.env.TLS_MIN_VERSION || 'TLSv1.2',
          maxVersion: process.env.TLS_MAX_VERSION || 'TLSv1.3',
          // Cipher configuration
          ciphers: process.env.TLS_CIPHERS || 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384',
          // Honor cipher order
          honorCipherOrder: true,
          // Reject unauthorized (can be disabled for development)
          rejectUnauthorized: process.env.NODE_ENV === 'production'
        };
      } catch (error) {
        logger.error('Failed to load custom SSL certificates', {
          error: error.message
        });
        return null;
      }
    } else {
      logger.warn('Custom SSL certificates not found at specified paths', {
        cert: customCertPath,
        key: customKeyPath
      });
    }
  }

  // Use self-signed certificate for localhost
  if (!certificatesExist()) {
    logger.info('SSL certificates not found, generating new self-signed certificate...');
    if (!generateSelfSignedCertificate()) {
      logger.error('Failed to generate self-signed certificate, TLS will be disabled');
      return null;
    }
  }

  try {
    logger.info('Using self-signed SSL certificate for localhost', {
      cert: CERT_PATH,
      key: KEY_PATH
    });

    return {
      cert: fs.readFileSync(CERT_PATH),
      key: fs.readFileSync(KEY_PATH),
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
      ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384',
      honorCipherOrder: true,
      rejectUnauthorized: false // Allow self-signed for development
    };
  } catch (error) {
    logger.error('Failed to load self-signed SSL certificates', {
      error: error.message
    });
    return null;
  }
}

/**
 * Get certificate information
 */
function getCertificateInfo() {
  const customCertPath = process.env.TLS_CERT_PATH;
  const certPath = customCertPath && fs.existsSync(customCertPath) ? customCertPath : CERT_PATH;

  if (!fs.existsSync(certPath)) {
    return null;
  }

  try {
    const subject = execSync(`openssl x509 -in "${certPath}" -noout -subject`, {
      stdio: 'pipe'
    }).toString().trim();

    const issuer = execSync(`openssl x509 -in "${certPath}" -noout -issuer`, {
      stdio: 'pipe'
    }).toString().trim();

    const dates = execSync(`openssl x509 -in "${certPath}" -noout -dates`, {
      stdio: 'pipe'
    }).toString().trim();

    const san = execSync(`openssl x509 -in "${certPath}" -noout -ext subjectAltName`, {
      stdio: 'pipe'
    }).toString().trim();

    return {
      path: certPath,
      subject: subject.replace('subject=', ''),
      issuer: issuer.replace('issuer=', ''),
      dates,
      subjectAltName: san
    };
  } catch (error) {
    logger.error('Failed to get certificate info', { error: error.message });
    return null;
  }
}

/**
 * Regenerate self-signed certificate
 */
function regenerateCertificate() {
  logger.info('Regenerating SSL certificate...');

  // Remove old certificates
  if (fs.existsSync(CERT_PATH)) {
    fs.unlinkSync(CERT_PATH);
  }
  if (fs.existsSync(KEY_PATH)) {
    fs.unlinkSync(KEY_PATH);
  }

  return generateSelfSignedCertificate();
}

module.exports = {
  getTLSOptions,
  getCertificateInfo,
  regenerateCertificate,
  certificatesExist,
  CERT_DIR,
  CERT_PATH,
  KEY_PATH
};
