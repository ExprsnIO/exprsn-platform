/**
 * ═══════════════════════════════════════════════════════════════════════
 * ACME JWS verification (RFC 8555 §6.2, RFC 7515 flattened JSON)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Every ACME POST body is a flattened JSON JWS. The protected header
 * must carry: alg (RS256 | ES256), nonce (single-use), url (exact match)
 * and exactly one of jwk (new-account / revoke-by-key) or kid.
 */

const nodeCrypto = require('node:crypto');
const nonces = require('./nonce');
const problems = require('./problems');

const ALLOWED_ALGS = ['RS256', 'ES256'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * RFC 7638 JWK thumbprint (SHA-256, base64url).
 * @param {Object} jwk - public key JWK
 * @returns {string}
 */
function jwkThumbprint(jwk) {
  let canonical;

  if (jwk && jwk.kty === 'RSA' && jwk.e && jwk.n) {
    // Lexicographic member order: e, kty, n
    canonical = { e: jwk.e, kty: 'RSA', n: jwk.n };
  } else if (jwk && jwk.kty === 'EC' && jwk.crv && jwk.x && jwk.y) {
    // Lexicographic member order: crv, kty, x, y
    canonical = { crv: jwk.crv, kty: 'EC', x: jwk.x, y: jwk.y };
  } else {
    throw problems.badPublicKey('JWK must be an RSA or EC public key');
  }

  return nodeCrypto
    .createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('base64url');
}

/**
 * Verify a JWS signature with node:crypto.
 * @returns {boolean}
 */
function verifySignature({ protectedB64, payloadB64, signatureB64, jwk, alg }) {
  let publicKey;
  try {
    publicKey = nodeCrypto.createPublicKey({ key: jwk, format: 'jwk' });
  } catch (error) {
    throw problems.badPublicKey(`Could not import JWK: ${error.message}`);
  }

  const signingInput = Buffer.from(`${protectedB64}.${payloadB64}`, 'ascii');
  let signature;
  try {
    signature = Buffer.from(signatureB64, 'base64url');
  } catch (error) {
    return false;
  }

  try {
    if (alg === 'RS256') {
      if (jwk.kty !== 'RSA') return false;
      return nodeCrypto.verify('sha256', signingInput, publicKey, signature);
    }

    if (alg === 'ES256') {
      if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') return false;
      return nodeCrypto.verify(
        'sha256',
        signingInput,
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        signature
      );
    }
  } catch (error) {
    return false;
  }

  return false;
}

/**
 * Verify the JWS in an ACME POST request.
 *
 * @param {Object} req - Express request (body must be the flattened JWS)
 * @param {Object} options
 * @param {string} options.acmeBase - external base URL of the ACME router
 * @param {string} [options.mode='kid'] - 'jwk' | 'kid' | 'either'
 * @returns {Promise<{header, payload, account, jwk, isPostAsGet}>}
 */
async function verifyJwsRequest(req, options = {}) {
  const mode = options.mode || 'kid';
  const body = req.body;

  if (
    !body || typeof body !== 'object' ||
    typeof body.protected !== 'string' ||
    typeof body.signature !== 'string' ||
    typeof body.payload !== 'string'
  ) {
    throw problems.malformed('Request body must be a flattened JSON JWS');
  }

  let header;
  try {
    header = JSON.parse(Buffer.from(body.protected, 'base64url').toString('utf8'));
  } catch (error) {
    throw problems.malformed('Invalid JWS protected header');
  }

  // alg allowlist — explicitly rejects "none" and HMAC algorithms
  if (!header.alg || !ALLOWED_ALGS.includes(header.alg)) {
    throw problems.badSignatureAlgorithm();
  }

  // nonce: present and single-use
  if (!header.nonce || typeof header.nonce !== 'string') {
    throw problems.badNonce('JWS protected header must include a nonce');
  }
  if (!(await nonces.consume(header.nonce))) {
    throw problems.badNonce();
  }

  // url: exact match against the externally-visible request URL
  const expectedUrl = `${options.acmeBase}${req.path}`;
  if (header.url !== expectedUrl) {
    throw problems.malformed(
      `JWS "url" header (${header.url}) does not match request URL (${expectedUrl})`
    );
  }

  if (header.jwk && header.kid) {
    throw problems.malformed('JWS must not contain both "jwk" and "kid"');
  }

  let jwk = null;
  let account = null;
  const useJwk = header.jwk && (mode === 'jwk' || mode === 'either');
  const useKid = header.kid && (mode === 'kid' || mode === 'either');

  if (useJwk) {
    if (typeof header.jwk !== 'object') {
      throw problems.malformed('JWS "jwk" header must be an object');
    }
    jwk = header.jwk;
  } else if (useKid) {
    const prefix = `${options.acmeBase}/acct/`;
    if (typeof header.kid !== 'string' || !header.kid.startsWith(prefix)) {
      throw problems.malformed('JWS "kid" header must be an account URL');
    }

    const accountId = header.kid.slice(prefix.length);
    if (!UUID_RE.test(accountId)) {
      throw problems.accountDoesNotExist();
    }

    // Lazy require to avoid loading the DB layer at module load time
    const { AcmeAccount } = require('../models');
    account = await AcmeAccount.findByPk(accountId);
    if (!account) {
      throw problems.accountDoesNotExist();
    }
    if (account.status !== 'valid') {
      throw problems.unauthorized('Account is not valid');
    }

    jwk = account.jwk;
  } else {
    throw problems.malformed(
      mode === 'jwk'
        ? 'JWS protected header must include "jwk"'
        : 'JWS protected header must include "kid"'
    );
  }

  const valid = verifySignature({
    protectedB64: body.protected,
    payloadB64: body.payload,
    signatureB64: body.signature,
    jwk,
    alg: header.alg
  });

  if (!valid) {
    throw problems.malformed('JWS signature verification failed');
  }

  // POST-as-GET: empty payload
  let payload = null;
  const isPostAsGet = body.payload === '';
  if (!isPostAsGet) {
    try {
      payload = JSON.parse(Buffer.from(body.payload, 'base64url').toString('utf8'));
    } catch (error) {
      throw problems.malformed('JWS payload is not valid JSON');
    }
  }

  return { header, payload, account, jwk, isPostAsGet };
}

module.exports = {
  jwkThumbprint,
  verifySignature,
  verifyJwsRequest
};
