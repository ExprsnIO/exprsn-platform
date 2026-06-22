/**
 * ═══════════════════════════════════════════════════════════
 * TLS Configuration Helper
 * Provides HTTPS server creation for all Exprsn services
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * Auto-generate self-signed certificate for development
 */
function generateSelfSignedCert(certPath, keyPath) {
  const { execSync } = require('child_process');
  const certDir = path.dirname(certPath);

  // Create certs directory if it doesn't exist
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  console.log('[TLS] Generating self-signed certificate for development...');

  try {
    execSync(`openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/C=US/ST=Development/L=Local/O=Exprsn/OU=Development/CN=localhost"`, {
      stdio: 'pipe'
    });
    console.log('[TLS] Self-signed certificate generated successfully');
    console.log(`[TLS] Certificate: ${certPath}`);
    console.log(`[TLS] Private Key: ${keyPath}`);
  } catch (error) {
    throw new Error(`Failed to generate self-signed certificate: ${error.message}`);
  }
}

/**
 * Get TLS options from environment or default certificate paths
 */
function getTLSOptions() {
  // Try multiple possible certificate locations
  const possiblePaths = [
    {
      cert: process.env.TLS_CERT_PATH,
      key: process.env.TLS_KEY_PATH
    },
    {
      cert: path.join(__dirname, '../../certs/localhost-cert.pem'),
      key: path.join(__dirname, '../../certs/localhost-key.pem')
    },
    {
      cert: path.join(__dirname, '../exprsn-svr/certs/cert.pem'),
      key: path.join(__dirname, '../exprsn-svr/certs/key.pem')
    },
    {
      cert: path.join(process.cwd(), 'certs/cert.pem'),
      key: path.join(process.cwd(), 'certs/key.pem')
    }
  ];

  // Find existing certificate or generate new one
  let certPath, keyPath;

  for (const paths of possiblePaths) {
    if (paths.cert && paths.key && fs.existsSync(paths.cert) && fs.existsSync(paths.key)) {
      certPath = paths.cert;
      keyPath = paths.key;
      console.log(`[TLS] Using existing certificate: ${certPath}`);
      break;
    }
  }

  // If no certificate found, auto-generate a self-signed one — development only.
  // In production a missing cert/key is a hard configuration error.
  if (!certPath || !keyPath) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[TLS] No TLS certificate/key found in production. ' +
        'Set TLS_CERT_PATH and TLS_KEY_PATH to valid certificate files.'
      );
    }
    certPath = path.join(process.cwd(), 'certs/cert.pem');
    keyPath = path.join(process.cwd(), 'certs/key.pem');
    generateSelfSignedCert(certPath, keyPath);
  }

  return {
    key: fs.readFileSync(keyPath, 'utf8'),
    cert: fs.readFileSync(certPath, 'utf8'),
    // Disallow legacy TLS protocol versions
    minVersion: 'TLSv1.2',
    // For development, allow self-signed certificates
    rejectUnauthorized: process.env.NODE_ENV === 'production'
  };
}

/**
 * Create an HTTPS server with the Express app
 * @param {Express} app - Express application instance
 * @returns {https.Server} HTTPS server instance
 */
function createHTTPSServer(app) {
  // Enable TLS by default for development if not explicitly disabled
  const tlsEnabled = process.env.TLS_ENABLED !== 'false';

  if (!tlsEnabled) {
    console.log('[TLS] TLS disabled via TLS_ENABLED=false');
    return null;
  }

  try {
    const options = getTLSOptions();
    console.log('[TLS] HTTPS server created successfully');
    return https.createServer(options, app);
  } catch (error) {
    console.error('[TLS] Failed to create HTTPS server:', error.message);

    // NEVER silently downgrade to plain HTTP in production
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`[TLS] Cannot start without TLS in production: ${error.message}`);
    }

    console.error('[TLS] Falling back to HTTP (non-production only). Set TLS_ENABLED=false to disable this warning.');
    return null;
  }
}

/**
 * Check if TLS is enabled and configured
 */
function isTLSEnabled() {
  // Enable TLS by default unless explicitly disabled
  return process.env.TLS_ENABLED !== 'false';
}

/**
 * Get the protocol (http or https) based on configuration
 */
function getProtocol() {
  return isTLSEnabled() ? 'https' : 'http';
}

module.exports = {
  getTLSOptions,
  createHTTPSServer,
  isTLSEnabled,
  getProtocol
};
