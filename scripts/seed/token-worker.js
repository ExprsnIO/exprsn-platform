'use strict';

/**
 * Forked token worker.
 * argv: token <planFile> <start> <end> <outFile>
 * Each plan item: { userId, certId, serial, email, count }
 *
 * Generates real CA tokens: the checksum + RSA-SHA256-PSS signature are
 * computed exactly like services/ca/services/token.js so each token verifies
 * against its signing certificate. Rows are bulk-inserted in batches for speed
 * (we skip the per-token AuditLog the live service writes).
 */

const crypto = require('crypto');
const { runSlice } = require('./common');
const caCrypto = require('../../services/ca/crypto');
const { getStorage } = require('../../services/ca/storage');
const caConfig = require('../../services/ca/config');
const { Token } = require('../../services/ca/models');

const DOMAIN = caConfig.ca.domain;
const VERSION = caConfig.token.version;
const INSERT_BATCH = 500;
const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

const keyCache = new Map();

async function getKey(certId) {
  if (keyCache.has(certId)) return keyCache.get(certId);
  const pem = await getStorage().getPrivateKey(certId);
  keyCache.set(certId, pem);
  return pem;
}

function buildToken(item, pem, n) {
  const id = crypto.randomUUID();
  const issuedAt = Date.now();
  const notBefore = issuedAt;
  // Mix expiry types for realistic variety; keep validity long so tokens stay usable.
  const persistent = n % 10 === 0;
  const expiryType = persistent ? 'persistent' : 'time';
  const expiresAt = persistent ? null : issuedAt + THIRTY_DAYS_MS;

  const permissions = {
    read: true,
    write: n % 2 === 0,
    append: n % 3 === 0,
    delete: false,
    update: n % 2 === 0,
  };
  const resourceType = 'url';
  const resourceValue = '/';
  const tokenData = { userId: item.userId, email: item.email, seed: true };

  // BIGINT columns (issuedAt/notBefore/expiresAt) read back from Postgres as
  // STRINGS. validateToken reconstructs the canonical object from those DB
  // values, so we must sign over the string form (null stays null) for the
  // RSA-SHA256-PSS signature to verify.
  const issuedAtC = String(issuedAt);
  const notBeforeC = String(notBefore);
  const expiresAtC = expiresAt === null ? null : String(expiresAt);

  // Identical shape to tokenService.generateToken's tokenForChecksum.
  const obj = {
    id,
    version: VERSION,
    issuer: { domain: DOMAIN, certificateSerial: item.serial },
    permissions,
    resource: { [resourceType]: resourceValue },
    data: tokenData,
    issuedAt: issuedAtC,
    notBefore: notBeforeC,
    expiresAt: expiresAtC,
    expiryType,
  };
  const checksum = caCrypto.calculateChecksum(obj);
  const canonical = JSON.stringify(obj, Object.keys(obj).sort());
  const signature = caCrypto.signData(canonical, pem);

  return {
    id,
    version: VERSION,
    userId: item.userId,
    certificateId: item.certId,
    permissionRead: permissions.read,
    permissionWrite: permissions.write,
    permissionAppend: permissions.append,
    permissionDelete: permissions.delete,
    permissionUpdate: permissions.update,
    resourceType,
    resourceValue,
    expiryType,
    issuedAt,
    notBefore,
    expiresAt,
    usesRemaining: null,
    maxUses: null,
    useCount: 0,
    tokenData,
    checksum,
    signature,
    status: 'active',
    metadata: { seed: true },
  };
}

async function main() {
  await runSlice(async (item) => {
    const pem = await getKey(item.certId);
    let created = 0;
    let batch = [];
    for (let n = 0; n < item.count; n++) {
      batch.push(buildToken(item, pem, n));
      if (batch.length >= INSERT_BATCH) {
        await Token.bulkCreate(batch, { validate: false });
        created += batch.length;
        batch = [];
      }
    }
    if (batch.length) {
      await Token.bulkCreate(batch, { validate: false });
      created += batch.length;
    }
    return { created };
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
