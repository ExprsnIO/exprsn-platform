/**
 * ═══════════════════════════════════════════════════════════════════════
 * ACME challenge validation — http-01 / dns-01 (RFC 8555 §8)
 * ═══════════════════════════════════════════════════════════════════════
 */

const dns = require('node:dns');
const net = require('node:net');
const nodeCrypto = require('node:crypto');
const axios = require('axios');

const HTTP_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

function allowPrivateIdentifiers() {
  return process.env.ACME_ALLOW_PRIVATE_IDENTIFIERS === 'true';
}

/**
 * Loopback / link-local / private address check (SSRF guard).
 */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const octets = ip.split('.').map(Number);
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }

  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
  if (lower.startsWith('fe8') || lower.startsWith('fe9') ||
      lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local fe80::/10
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.replace('::ffff:', '');
    if (net.isIPv4(mapped)) return isPrivateIp(mapped);
  }

  return false;
}

/**
 * Resolve an identifier and reject loopback/private destinations unless
 * ACME_ALLOW_PRIVATE_IDENTIFIERS === 'true'.
 */
async function assertPublicHost(host) {
  if (allowPrivateIdentifiers()) {
    return;
  }

  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      throw new Error(`Identifier ${host} resolves to a private or loopback address`);
    }
    return;
  }

  let addresses;
  try {
    addresses = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch (error) {
    throw new Error(`DNS lookup for ${host} failed: ${error.code || error.message}`);
  }

  if (!addresses.length) {
    throw new Error(`DNS lookup for ${host} returned no addresses`);
  }

  for (const entry of addresses) {
    if (isPrivateIp(entry.address)) {
      throw new Error(`Identifier ${host} resolves to a private or loopback address`);
    }
  }
}

/**
 * keyAuthorization = token || '.' || base64url(JWK thumbprint)
 */
function keyAuthorization(token, thumbprint) {
  return `${token}.${thumbprint}`;
}

/**
 * dns-01 expected TXT record: base64url(SHA-256(keyAuthorization))
 */
function dnsTxtValue(keyAuth) {
  return nodeCrypto.createHash('sha256').update(keyAuth, 'ascii').digest('base64url');
}

/**
 * Validate an http-01 challenge.
 * @returns {Promise<{ok: boolean, detail?: string}>}
 */
async function validateHttp01(identifierValue, token, keyAuth) {
  try {
    await assertPublicHost(identifierValue);
  } catch (error) {
    return { ok: false, detail: error.message };
  }

  const url = `http://${identifierValue}/.well-known/acme-challenge/${token}`;

  try {
    const response = await axios.get(url, {
      timeout: HTTP_TIMEOUT_MS,
      maxRedirects: MAX_REDIRECTS,
      maxContentLength: 16 * 1024,
      responseType: 'text',
      transformResponse: [data => data],
      validateStatus: status => status === 200,
      headers: { 'User-Agent': 'Exprsn-CA-ACME/1.0' }
    });

    const body = String(response.data || '').trim();
    if (body === keyAuth) {
      return { ok: true };
    }

    return {
      ok: false,
      detail: `Key authorization mismatch at ${url}`
    };
  } catch (error) {
    return {
      ok: false,
      detail: `Failed to fetch ${url}: ${error.code || error.message}`
    };
  }
}

/**
 * Validate a dns-01 challenge.
 * @returns {Promise<{ok: boolean, detail?: string}>}
 */
async function validateDns01(identifierValue, keyAuth) {
  const recordName = `_acme-challenge.${identifierValue}`;
  const expected = dnsTxtValue(keyAuth);

  let records;
  try {
    records = await dns.promises.resolveTxt(recordName);
  } catch (error) {
    return {
      ok: false,
      detail: `TXT lookup for ${recordName} failed: ${error.code || error.message}`
    };
  }

  for (const chunks of records) {
    if (chunks.join('') === expected) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    detail: `No TXT record for ${recordName} matched the expected value`
  };
}

module.exports = {
  isPrivateIp,
  assertPublicHost,
  keyAuthorization,
  dnsTxtValue,
  validateHttp01,
  validateDns01
};
