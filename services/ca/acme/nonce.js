/**
 * ═══════════════════════════════════════════════════════════════════════
 * ACME replay nonces — single-use, DB-backed (RFC 8555 §6.5)
 * ═══════════════════════════════════════════════════════════════════════
 */

const nodeCrypto = require('node:crypto');

const NONCE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_PROBABILITY = 0.01;

// Lazy requires keep this module loadable without the DB layer
function getDeps() {
  const { Op } = require('sequelize');
  const { AcmeNonce } = require('../models');
  return { Op, AcmeNonce };
}

/**
 * Issue a fresh nonce and persist it.
 * @returns {Promise<string>} base64url nonce
 */
async function issue() {
  const { Op, AcmeNonce } = getDeps();
  const nonce = nodeCrypto.randomBytes(16).toString('base64url');

  await AcmeNonce.create({
    nonce,
    expiresAt: new Date(Date.now() + NONCE_TTL_MS)
  });

  // Opportunistic cleanup of expired nonces
  if (Math.random() < CLEANUP_PROBABILITY) {
    AcmeNonce.destroy({
      where: { expiresAt: { [Op.lt]: new Date() } }
    }).catch(() => {});
  }

  return nonce;
}

/**
 * Verify and consume a nonce (single use).
 * @param {string} nonce
 * @returns {Promise<boolean>} true if the nonce was valid and consumed
 */
async function consume(nonce) {
  if (!nonce || typeof nonce !== 'string' || nonce.length > 64) {
    return false;
  }

  const { Op, AcmeNonce } = getDeps();
  const deleted = await AcmeNonce.destroy({
    where: {
      nonce,
      expiresAt: { [Op.gt]: new Date() }
    }
  });

  return deleted > 0;
}

module.exports = {
  issue,
  consume
};
