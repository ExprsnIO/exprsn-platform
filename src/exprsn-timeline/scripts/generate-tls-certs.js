/**
 * ═══════════════════════════════════════════════════════════
 * TLS Certificate Generation for Timeline Service
 * Generates self-signed certificates for local development
 * ═══════════════════════════════════════════════════════════
 */

const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

const certsDir = path.join(__dirname, '../certs');

/**
 * Ensure directory exists
 */
function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✓ Created directory: ${dirPath}`);
  }
}

/**
 * Generate self-signed certificate for localhost
 */
function generateLocalhostCertificate() {
  const certPath = path.join(certsDir, 'localhost-cert.pem');
  const keyPath = path.join(certsDir, 'localhost-key.pem');

  // Check if certificates already exist
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    console.log('✓ TLS certificates already exist, skipping generation...');
    return {
      certPath,
      keyPath
    };
  }

  console.log('Generating TLS certificate for localhost...');

  // Generate key pair
  console.log('  → Generating RSA key pair (2048-bit)...');
  const keys = forge.pki.rsa.generateKeyPair(2048);

  // Create certificate
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01' + Date.now();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  // Set subject and issuer
  const attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'countryName', value: 'US' },
    { name: 'stateOrProvinceName', value: 'California' },
    { name: 'localityName', value: 'San Francisco' },
    { name: 'organizationName', value: 'Exprsn Timeline Service' },
    { shortName: 'OU', value: 'Development' }
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  // Add extensions
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: false
    },
    {
      name: 'keyUsage',
      keyCertSign: false,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true
    },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 2, value: '*.localhost' },
        { type: 7, ip: '127.0.0.1' },
        { type: 7, ip: '::1' }
      ]
    },
    {
      name: 'subjectKeyIdentifier'
    }
  ]);

  // Self-sign certificate
  console.log('  → Signing certificate...');
  cert.sign(keys.privateKey, forge.md.sha256.create());

  // Ensure certs directory exists
  ensureDirectory(certsDir);

  // Save to files
  console.log('  → Writing certificate files...');
  fs.writeFileSync(keyPath, forge.pki.privateKeyToPem(keys.privateKey));
  fs.writeFileSync(certPath, forge.pki.certificateToPem(cert));

  // Set restrictive permissions on private key
  fs.chmodSync(keyPath, 0o600);

  console.log('✓ TLS certificate generated successfully');
  console.log(`  Certificate: ${certPath}`);
  console.log(`  Private Key: ${keyPath}`);
  console.log('  Valid for: 1 year');
  console.log('  ⚠️  For development only - DO NOT use in production');

  return {
    certPath,
    keyPath
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Timeline Service - TLS Certificate Generator');
    console.log('═══════════════════════════════════════════════════════════\n');

    const result = generateLocalhostCertificate();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Certificate Generation Complete');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('To enable TLS, set in your .env file:');
    console.log('  TLS_ENABLED=true');
    console.log(`  TLS_CERT_PATH=${result.certPath}`);
    console.log(`  TLS_KEY_PATH=${result.keyPath}`);
    console.log('');
  } catch (error) {
    console.error('✗ Error generating certificates:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { generateLocalhostCertificate };
