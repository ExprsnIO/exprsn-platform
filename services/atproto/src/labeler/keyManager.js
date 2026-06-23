/**
 * ═══════════════════════════════════════════════════════════
 * Signing key manager
 *
 * Resolves the labeler's secp256k1 (k256) signing keypair from a *reference*,
 * never a key stored in Postgres. Resolution order:
 *   1. config.labeler.signingKey            (inline, dev only)
 *   2. process.env[config.labeler.signingKeyRef]  (env var named by the ref)
 * The value is a hex-encoded 32-byte private key. Uses @atproto/crypto for
 * import + low-S signing so signatures match AT-Protocol verification.
 * ═══════════════════════════════════════════════════════════
 */

const config = require('../../config');
const { load } = require('../util/esm');

let keypairPromise = null;

function resolvePrivateKeyHex() {
  if (config.labeler.signingKey) return config.labeler.signingKey.trim();
  const ref = config.labeler.signingKeyRef;
  if (ref && process.env[ref]) return process.env[ref].trim();
  return null;
}

/** Lazily import + cache the active signing keypair. Throws if none configured. */
async function getKeypair() {
  if (keypairPromise) return keypairPromise;
  keypairPromise = (async () => {
    const hex = resolvePrivateKeyHex();
    if (!hex) {
      throw new Error(
        'No signing key configured. Set ATPROTO_SIGNING_KEY (dev) or the env var ' +
          `named by ATPROTO_SIGNING_KEY_REF ("${config.labeler.signingKeyRef}").`
      );
    }
    const { crypto } = await load();
    // Secp256k1Keypair.import accepts a hex string or bytes.
    return crypto.Secp256k1Keypair.import(hex, { exportable: false });
  })();
  return keypairPromise;
}

/** Reset the cache (used after key rotation / in tests). */
function reset() {
  keypairPromise = null;
}

/**
 * Generate a fresh exportable keypair. Returns { keypair, did, privateKeyHex,
 * publicKeyMultibase }. The caller is responsible for storing the private key
 * securely (vault/KMS) and discarding it from memory.
 */
async function generateKeypair() {
  const { crypto } = await load();
  const keypair = await crypto.Secp256k1Keypair.create({ exportable: true });
  const did = keypair.did(); // did:key:z...
  const privBytes = await keypair.export();
  const { toString } = await load();
  const privateKeyHex = toString(privBytes, 'hex');
  return {
    keypair,
    did,
    privateKeyHex,
    // Multikey publicKeyMultibase is the did:key suffix (after "did:key:").
    publicKeyMultibase: did.replace(/^did:key:/, ''),
  };
}

module.exports = { getKeypair, generateKeypair, reset, resolvePrivateKeyHex };
