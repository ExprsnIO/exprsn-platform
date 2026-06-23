'use strict';

/**
 * Forked certificate worker.
 * argv: <phase: root|intermediate|entity> <planFile> <start> <end> <outFile>
 *
 * Uses the real CA CertificateService so every certificate is genuinely
 * generated (node-forge RSA keypair, signed by its issuer, stored on disk).
 */

const { runSlice } = require('./common');
const certificateService = require('../../services/ca/services/certificate');
const { getStorage } = require('../../services/ca/storage');

async function main() {
  // Ensure the on-disk cert/key store dirs exist (service writes into them).
  await getStorage().initialize();

  const phase = process.argv[2];

  await runSlice(async (item) => {
    if (phase === 'root') {
      const cert = await certificateService.createRootCertificate({
        commonName: item.commonName,
        organization: item.orgName,
        organizationalUnit: 'Seed CA',
        country: 'US',
        email: item.email,
      }, item.ownerId);
      return { id: cert.id, serial: cert.serialNumber };
    }

    if (phase === 'intermediate') {
      const cert = await certificateService.createIntermediateCertificate({
        rootCertificateId: item.rootCertId,
        commonName: item.commonName,
        organization: item.orgName,
        organizationalUnit: 'Seed Intermediate',
        validityYears: 5,
      }, item.ownerId);
      return { id: cert.id, serial: cert.serialNumber };
    }

    if (phase === 'entity') {
      const { certificate } = await certificateService.createEntityCertificate({
        issuerId: item.issuerId,
        commonName: item.commonName,
        organization: item.orgName,
        organizationalUnit: 'Seed Entity',
        email: item.email,
        type: item.type,
      }, item.userId);
      return { id: certificate.id, serial: certificate.serialNumber };
    }

    throw new Error(`unknown cert phase: ${phase}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
