/**
 * ═══════════════════════════════════════════════════════════
 * Per-user DID service
 *
 * Mints + manages a user's AT-Protocol identities:
 *   did:exprsn — platform-derived, self-certifying. The signing key is derived
 *     deterministically as HMAC-SHA256(userDidSecret, "atproto:user-did:<userId>")
 *     reduced to a valid k256 scalar, so it is reproducible and NEVER stored.
 *     Only the resulting DID is cached in user_dids.
 *   did:web / did:plc — linked by the user; we resolve them to mark verified.
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const config = require('../../config');
const { load } = require('../util/esm');
const didResolver = require('./didResolver');
const proofOfControl = require('./proofOfControl');

const CHALLENGE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Derive the user's deterministic did:exprsn. Returns { did, didKey,
 * publicKeyMultibase }. Throws if no userDidSecret is configured.
 */
async function deriveExprsnDid(userId) {
  if (!config.labeler.userDidSecret) {
    throw new Error('ATPROTO_USER_DID_SECRET (or SERVICE_TOKEN_SECRET) must be set to derive user DIDs.');
  }
  const { crypto: atcrypto } = await load();

  // Try successive HMAC outputs until one is a valid secp256k1 private key
  // (rejection sampling — effectively first-try).
  for (let i = 0; i < 8; i++) {
    const seed = crypto
      .createHmac('sha256', config.labeler.userDidSecret)
      .update(`atproto:user-did:${userId}:${i}`)
      .digest('hex');
    try {
      // eslint-disable-next-line no-await-in-loop
      const keypair = await atcrypto.Secp256k1Keypair.import(seed, { exportable: false });
      const didKey = keypair.did();
      const publicKeyMultibase = didKey.replace(/^did:key:/, '');
      return { did: didResolver.didExprsnFromKey(publicKeyMultibase), didKey, publicKeyMultibase };
    } catch (_) {
      // invalid scalar — try next counter
    }
  }
  throw new Error('failed to derive a valid did:exprsn key');
}

/** Get the user's DID row, creating it (with a derived did:exprsn) if absent. */
async function getOrCreate(models, userId) {
  let row = await models.UserDid.findByPk(userId);
  if (row && row.didExprsn) return row;
  const { did } = await deriveExprsnDid(userId);
  if (row) {
    row = await row.update({ didExprsn: did });
  } else {
    row = await models.UserDid.create({ userId, didExprsn: did });
  }
  return row;
}

/**
 * Link a did:web or did:plc to the user. Validates the method and that the DID
 * RESOLVES (else rejects), but does NOT mark it verified — ownership must be
 * proven via issueChallenge + verifyControl. Linking resets any prior proof.
 */
async function link(models, userId, method, did) {
  if (method !== 'web' && method !== 'plc') throw new Error('method must be web or plc');
  const parsed = didResolver.parseDid(did);
  if (!parsed || parsed.method !== method) throw new Error(`not a valid did:${method}`);

  const resolved = await didResolver.resolveDid(did);
  if (!resolved) throw new Error(`did:${method} does not resolve`);

  const row = await getOrCreate(models, userId);
  const fields = method === 'web'
    ? { didWeb: did, didWebVerified: false, didWebProof: null }
    : { didPlc: did, didPlcVerified: false, didPlcProof: null };
  return row.update(fields);
}

/**
 * Issue a one-time proof-of-control challenge. The user publishes the token
 * (well-known file for did:web, or Bluesky profile description for did:plc),
 * then calls verifyControl. Returns { token, expiresAt, instructions }.
 */
async function issueChallenge(models, userId) {
  const row = await getOrCreate(models, userId);
  const token = `exprsn-verify-${crypto.randomBytes(12).toString('hex')}`;
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await row.update({ challenge: token, challengeExpiresAt: expiresAt });
  return {
    token,
    expiresAt,
    instructions: {
      web: `Serve "${token}" at https://<your-did-web-host>/.well-known/atproto-did-challenge.txt`,
      plc: `Add "${token}" to your Bluesky profile description, then verify.`,
    },
  };
}

/**
 * Verify control of the user's linked did:web/did:plc against the active
 * challenge. On success marks verified + records the proof method.
 * @returns {Promise<{ verified: boolean, method?: string, reason?: string }>}
 */
async function verifyControl(models, userId, method, opts = {}) {
  if (method !== 'web' && method !== 'plc') throw new Error('method must be web or plc');
  const row = await models.UserDid.findByPk(userId);
  if (!row) return { verified: false, reason: 'no_dids' };

  const did = method === 'web' ? row.didWeb : row.didPlc;
  if (!did) return { verified: false, reason: 'not_linked' };
  if (!row.challenge || !row.challengeExpiresAt || row.challengeExpiresAt.getTime() < Date.now()) {
    return { verified: false, reason: 'no_active_challenge' };
  }

  const proof = await proofOfControl.verify(did, row.challenge, opts);
  if (!proof) return { verified: false, reason: 'challenge_not_found' };

  const fields = method === 'web'
    ? { didWebVerified: true, didWebProof: proof }
    : { didPlcVerified: true, didPlcProof: proof };
  // Consume the challenge.
  await row.update({ ...fields, challenge: null, challengeExpiresAt: null });
  return { verified: true, method: proof };
}

/** Unlink a did:web or did:plc from the user. */
async function unlink(models, userId, method) {
  if (method !== 'web' && method !== 'plc') throw new Error('method must be web or plc');
  const row = await models.UserDid.findByPk(userId);
  if (!row) return null;
  const fields = method === 'web'
    ? { didWeb: null, didWebVerified: false }
    : { didPlc: null, didPlcVerified: false };
  return row.update(fields);
}

/** Public serialization of a user's DIDs. */
function serialize(row) {
  return {
    userId: row.userId,
    didExprsn: row.didExprsn,
    didWeb: row.didWeb,
    didWebVerified: row.didWebVerified,
    didWebProof: row.didWebProof,
    didPlc: row.didPlc,
    didPlcVerified: row.didPlcVerified,
    didPlcProof: row.didPlcProof,
    challengePending: Boolean(row.challenge && row.challengeExpiresAt && row.challengeExpiresAt.getTime() >= Date.now()),
  };
}

module.exports = { deriveExprsnDid, getOrCreate, link, unlink, issueChallenge, verifyControl, serialize };
