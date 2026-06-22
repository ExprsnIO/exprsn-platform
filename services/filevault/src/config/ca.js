/**
 * ═══════════════════════════════════════════════════════════════════════
 * FileVault Certificate Authority Integration Configuration
 * ═══════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  domain: process.env.FILEVAULT_CA_DOMAIN || 'filevault.exprsn.io',
  certificateSerial: process.env.FILEVAULT_CERT_SERIAL || '',

  // CA service endpoint for token validation
  caServiceUrl: process.env.CA_SERVICE_URL || 'http://localhost:3000',

  // Paths to certificates and keys
  privateKeyPath: process.env.FILEVAULT_PRIVATE_KEY_PATH || '',
  certificatePath: process.env.FILEVAULT_CERTIFICATE_PATH || '',
  caRootCertPath: process.env.CA_ROOT_CERT_PATH || '',

  // Load certificates if paths are provided
  getPrivateKey: function() {
    if (this.privateKeyPath && fs.existsSync(this.privateKeyPath)) {
      return fs.readFileSync(this.privateKeyPath, 'utf8');
    }
    return null;
  },

  getCertificate: function() {
    if (this.certificatePath && fs.existsSync(this.certificatePath)) {
      return fs.readFileSync(this.certificatePath, 'utf8');
    }
    return null;
  },

  getCARootCert: function() {
    if (this.caRootCertPath && fs.existsSync(this.caRootCertPath)) {
      return fs.readFileSync(this.caRootCertPath, 'utf8');
    }
    return null;
  }
};
