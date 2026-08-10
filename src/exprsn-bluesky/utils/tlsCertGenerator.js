/**
 * TLS Certificate Generator
 * Automatically generates self-signed certificates for localhost development
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { logger } = require('@exprsn/shared');

const CERT_DIR = path.join(__dirname, '..', 'certs');
const CERT_FILE = path.join(CERT_DIR, 'localhost.crt');
const KEY_FILE = path.join(CERT_DIR, 'localhost.key');

/**
 * Check if TLS certificates exist
 */
function certificatesExist() {
    return fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE);
}

/**
 * Generate self-signed certificate for localhost
 */
function generateSelfSignedCertificate() {
    try {
        logger.info('Generating self-signed TLS certificate for localhost...');

        // Create certs directory if it doesn't exist
        if (!fs.existsSync(CERT_DIR)) {
            fs.mkdirSync(CERT_DIR, { recursive: true });
        }

        // Generate private key and certificate using OpenSSL
        const opensslCommand = `openssl req -x509 -newkey rsa:2048 -nodes \\
            -keyout "${KEY_FILE}" \\
            -out "${CERT_FILE}" \\
            -days 365 \\
            -subj "/C=US/ST=Development/L=Localhost/O=Exprsn/OU=Development/CN=localhost" \\
            -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1"`;

        execSync(opensslCommand, { stdio: 'pipe' });

        logger.info('Self-signed TLS certificate generated successfully');
        logger.info(`Certificate: ${CERT_FILE}`);
        logger.info(`Private Key: ${KEY_FILE}`);

        return true;
    } catch (error) {
        logger.error('Failed to generate self-signed certificate', {
            error: error.message,
            stderr: error.stderr?.toString()
        });
        return false;
    }
}

/**
 * Load TLS credentials from environment or generate self-signed
 */
function getTLSCredentials() {
    const tlsEnabled = process.env.TLS_ENABLED === 'true';

    if (!tlsEnabled) {
        return null;
    }

    // Check for environment-provided certificates
    const envCertPath = process.env.TLS_CERT_PATH;
    const envKeyPath = process.env.TLS_KEY_PATH;

    if (envCertPath && envKeyPath) {
        if (fs.existsSync(envCertPath) && fs.existsSync(envKeyPath)) {
            logger.info('Loading TLS certificates from environment');
            return {
                cert: fs.readFileSync(envCertPath),
                key: fs.readFileSync(envKeyPath),
                source: 'environment'
            };
        } else {
            logger.warn('TLS certificate paths provided but files not found');
        }
    }

    // Generate or load self-signed certificate for localhost
    if (!certificatesExist()) {
        const generated = generateSelfSignedCertificate();
        if (!generated) {
            logger.error('Failed to generate TLS certificates');
            return null;
        }
    } else {
        logger.info('Using existing self-signed TLS certificates');
    }

    return {
        cert: fs.readFileSync(CERT_FILE),
        key: fs.readFileSync(KEY_FILE),
        source: 'self-signed'
    };
}

/**
 * Get certificate information for display
 */
function getCertificateInfo(credentials) {
    if (!credentials) {
        return null;
    }

    return {
        source: credentials.source,
        certPath: credentials.source === 'environment' ? process.env.TLS_CERT_PATH : CERT_FILE,
        keyPath: credentials.source === 'environment' ? process.env.TLS_KEY_PATH : KEY_FILE
    };
}

module.exports = {
    getTLSCredentials,
    getCertificateInfo,
    certificatesExist,
    generateSelfSignedCertificate
};
