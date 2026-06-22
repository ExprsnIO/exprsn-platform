'use strict';

/**
 * Generate a 3-tier PKI for the Exprsn CA using the in-repo CA crypto module:
 *
 *   Root CA  (self-signed)
 *     └─ Intermediate CA  (signed by Root)
 *          └─ Code-signing certificate for admin@exprsn.local (signed by Intermediate)
 *
 * All private keys are written PEM-encrypted (AES-256) with the password from
 * PKI_PASSWORD (default "admin123"), and the code-signing identity is also
 * exported as a password-protected PKCS#12 (.p12) keystore.
 *
 * Output: certs/pki/
 *   root.crt root.key
 *   intermediate.crt intermediate.key
 *   codesign.crt codesign.key codesign.p12
 *   chain.pem (intermediate + root)  fullchain.pem (codesign + intermediate + root)
 *
 * Usage: node scripts/gen-pki.js   (or: npm run pki:gen)
 */

const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const ca = require('../services/ca/crypto');

const PASSWORD = process.env.PKI_PASSWORD || 'admin123';
const EMAIL = process.env.PKI_EMAIL || 'admin@exprsn.local';
const DOMAIN = process.env.PKI_DOMAIN || 'exprsn.local';
const outDir = path.join(__dirname, '..', 'certs', 'pki');

const subjectBase = {
  country: 'US',
  state: 'California',
  locality: 'San Francisco',
  organization: 'Exprsn IO',
};

function write(file, contents) {
  const p = path.join(outDir, file);
  fs.writeFileSync(p, contents, { mode: 0o600 });
  return p;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Generating PKI in ${outDir}`);
  console.log(`  identity: ${EMAIL}  (domain ${DOMAIN})`);
  console.log(`  key password: ${PASSWORD}\n`);

  // 1) Root CA — self-signed, 20y, 4096-bit
  console.log('• Root CA …');
  const root = await ca.generateRootCertificate({
    ...subjectBase,
    commonName: 'Exprsn Root CA',
    organizationalUnit: 'Certificate Authority',
    keySize: 4096,
    validityDays: 7300,
  });
  write('root.crt', root.certificate);
  write('root.key', ca.encryptPrivateKey(root.privateKey, PASSWORD));

  // 2) Intermediate CA — signed by Root, 10y, pathLen 0
  console.log('• Intermediate CA …');
  const inter = await ca.generateIntermediateCertificate({
    ...subjectBase,
    commonName: 'Exprsn Intermediate CA',
    organizationalUnit: 'Certificate Authority',
    keySize: 4096,
    validityDays: 3650,
    pathLen: 0,
    issuerCert: root.certificate,
    issuerKey: root.privateKey,
  });
  write('intermediate.crt', inter.certificate);
  write('intermediate.key', ca.encryptPrivateKey(inter.privateKey, PASSWORD));

  // 3) Code-signing certificate for admin@exprsn.local — signed by Intermediate
  console.log('• Code-signing certificate …');
  const code = await ca.generateEntityCertificate({
    ...subjectBase,
    commonName: EMAIL,
    organizationalUnit: 'Code Signing',
    email: EMAIL,
    type: 'code_signing',
    subjectAltNames: [`email:${EMAIL}`],
    keySize: 2048,
    validityDays: 825,
    issuerCert: inter.certificate,
    issuerKey: inter.privateKey,
  });
  write('codesign.crt', code.certificate);
  write('codesign.key', ca.encryptPrivateKey(code.privateKey, PASSWORD));

  // Chains
  write('chain.pem', inter.certificate + root.certificate);
  write('fullchain.pem', code.certificate + inter.certificate + root.certificate);

  // PKCS#12 keystore for the code-signing identity (password-protected)
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    forge.pki.privateKeyFromPem(code.privateKey),
    [code.certificate, inter.certificate, root.certificate].map((p) => forge.pki.certificateFromPem(p)),
    PASSWORD,
    { algorithm: '3des', friendlyName: EMAIL }
  );
  write('codesign.p12', Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary'));

  console.log('\nDone. Serial numbers:');
  console.log(`  root         ${root.serialNumber}`);
  console.log(`  intermediate ${inter.serialNumber}`);
  console.log(`  codesign     ${code.serialNumber}`);
}

main().catch((err) => {
  console.error('PKI generation failed:', err);
  process.exit(1);
});
