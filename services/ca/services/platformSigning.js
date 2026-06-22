'use strict';

/**
 * Platform token-signing certificate.
 *
 * The CA signs bearer tokens with a leaf certificate's private key. In the
 * consolidated platform the auth module mints tokens for auth users, so we
 * provision ONE dedicated leaf cert ("Platform Token Signing") issued by the
 * CA root and reuse it for every token. This is created lazily on first use and
 * cached for the process lifetime.
 */

const { Certificate } = require('../models');
const certificateService = require('./certificate');
const logger = require('../utils/logger');

const SIGNING_CN = 'Platform Token Signing';

let cachedId = null;
let inflight = null;

async function provision() {
  // Reuse an existing, still-valid signing cert if present.
  const existing = await Certificate.findOne({
    where: { commonName: SIGNING_CN, type: 'client', status: 'active' },
  });
  if (existing && existing.isValid()) {
    return existing.id;
  }

  // Issue one from the CA root.
  const root = await Certificate.findOne({ where: { type: 'root', status: 'active' } });
  if (!root) {
    throw new Error('CA root certificate not found; cannot provision token-signing certificate');
  }

  const { certificate } = await certificateService.createEntityCertificate(
    {
      issuerId: root.id,
      commonName: SIGNING_CN,
      organization: 'Exprsn IO',
      organizationalUnit: 'Token Signing',
      type: 'client',
      validityDays: 3650,
    },
    null, // system-owned (Certificate.userId is nullable)
  );

  logger.info('Provisioned platform token-signing certificate', { certificateId: certificate.id });
  return certificate.id;
}

/**
 * @returns {Promise<string>} id of the platform token-signing certificate
 */
async function getSigningCertificateId() {
  if (cachedId) return cachedId;
  if (!inflight) {
    inflight = provision()
      .then((id) => {
        cachedId = id;
        return id;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

module.exports = { getSigningCertificateId };
