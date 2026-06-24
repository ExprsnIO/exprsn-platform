/**
 * ═══════════════════════════════════════════════════════════
 * DID resolver — did:exprsn (+ did:web, did:key)
 *
 * `did:exprsn` is Exprsn's self-certifying DID method: the method-specific id IS
 * the multibase-encoded secp256k1 public key, exactly like did:key but under our
 * own namespace. That makes it resolvable OFFLINE — anyone can verify a label
 * signed by did:exprsn:zXYZ by extracting the key from the DID, no registry or
 * network round-trip. We use it for both directions of the bridge:
 *   - outgest: emit labels whose `src` is our did:exprsn
 *   - ingest:  verify inbound labels signed by any did:exprsn issuer
 *
 * For AT-Protocol PUBLIC interop you still want did:web/did:plc (Bluesky's
 * AppView only resolves those); did:exprsn is the native path inside the Exprsn
 * mesh. This resolver also serves our own did:web doc and plain did:key.
 * ═══════════════════════════════════════════════════════════
 */

const config = require('../../config');
const { safeFetchJson } = require('../util/safeFetch');

const EXPRSN_PREFIX = 'did:exprsn:';
const KEY_PREFIX = 'did:key:';

/** Parse a DID into { method, id }. */
function parseDid(did) {
  const m = /^did:([a-z0-9]+):(.+)$/.exec(String(did || ''));
  if (!m) return null;
  return { method: m[1], id: m[2] };
}

/** Build a did:exprsn from a multibase public key (self-certifying). */
function didExprsnFromKey(publicKeyMultibase) {
  return `${EXPRSN_PREFIX}${publicKeyMultibase}`;
}

/**
 * The did:key form used for signature verification. For self-certifying methods
 * (exprsn/key) the key is embedded; for others the caller supplies the multibase
 * read from the resolved DID document.
 */
function toDidKey(did, publicKeyMultibase) {
  if (did.startsWith(KEY_PREFIX)) return did;
  if (did.startsWith(EXPRSN_PREFIX)) return `${KEY_PREFIX}${did.slice(EXPRSN_PREFIX.length)}`;
  if (publicKeyMultibase) return `${KEY_PREFIX}${publicKeyMultibase}`;
  return null;
}

/** Build the DID document for a did:exprsn / did:key, with atproto label key + service. */
function buildSelfCertifyingDoc(did, publicKeyMultibase, host) {
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/multikey/v1',
    ],
    id: did,
    verificationMethod: [
      {
        id: `${did}#atproto_label`,
        type: 'Multikey',
        controller: did,
        publicKeyMultibase,
      },
    ],
    service: [
      { id: '#atproto_labeler', type: 'AtprotoLabeler', serviceEndpoint: `https://${host}` },
      { id: '#bsky_fg', type: 'BskyFeedGenerator', serviceEndpoint: `https://${host}` },
    ],
  };
}

/**
 * Resolve a DID to its document.
 *   - did:exprsn / did:key  → derived offline from the embedded key
 *   - did:web (our own host) → our served document (best-effort fetch otherwise)
 * Returns { doc, publicKeyMultibase } or null when unresolvable here.
 */
async function resolveDid(did, { fetchImpl = fetch } = {}) {
  const parsed = parseDid(did);
  if (!parsed) return null;
  const host = config.labeler.host;

  if (parsed.method === 'exprsn' || parsed.method === 'key') {
    const publicKeyMultibase = parsed.id;
    return { doc: buildSelfCertifyingDoc(did, publicKeyMultibase, host), publicKeyMultibase };
  }

  if (parsed.method === 'web') {
    // did:web:host[%3Aport][:path...] → https://host[:port]/[path/]did.json.
    // The authority is caller-controlled, so the fetch goes through safeFetchJson
    // (host allowlist + no redirects + size cap) to neutralize SSRF.
    const rest = parsed.id.split(':');
    const authority = decodeURIComponent(rest[0]);
    const pathParts = rest.slice(1);
    const url = pathParts.length
      ? `https://${authority}/${pathParts.join('/')}/did.json`
      : `https://${authority}/.well-known/did.json`;
    try {
      const doc = await safeFetchJson(url, { fetchImpl });
      if (!doc) return null;
      const vm = (doc.verificationMethod || []).find((v) => v.id.endsWith('#atproto_label'));
      return { doc, publicKeyMultibase: vm ? vm.publicKeyMultibase : null };
    } catch (_) {
      return null;
    }
  }

  if (parsed.method === 'plc') {
    // Resolve via the PLC directory, which serves the DID document directly.
    // Validate the PLC id shape (24 base32 chars) so an attacker can't smuggle
    // path traversal (`did:plc:..%2f..`) into the directory request; the colons
    // must stay literal, so we can't URL-encode the whole DID.
    if (!/^[a-z2-7]{24}$/.test(parsed.id)) return null;
    const base = config.labeler.plcDirectoryUrl || 'https://plc.directory';
    try {
      const doc = await safeFetchJson(`${base}/${did}`, { fetchImpl });
      if (!doc) return null;
      const vm = (doc.verificationMethod || []).find((v) => v.id.endsWith('#atproto_label'));
      return { doc, publicKeyMultibase: vm ? vm.publicKeyMultibase : null };
    } catch (_) {
      return null;
    }
  }

  return null;
}

module.exports = {
  parseDid,
  didExprsnFromKey,
  toDidKey,
  buildSelfCertifyingDoc,
  resolveDid,
  EXPRSN_PREFIX,
};
