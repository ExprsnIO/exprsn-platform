/**
 * ═══════════════════════════════════════════════════════════
 * Identifier helpers
 *
 * Bluesky authors are DIDs (did:plc:..., did:web:...), but the moderator's
 * ModerationCase.userId column is a UUID. We deterministically map a DID to a
 * UUIDv5 so per-author aggregation in the moderator still works, while the real
 * DID is preserved in uri_case_map.author_did + contentMetadata.authorDid.
 * ═══════════════════════════════════════════════════════════
 */

const { v5: uuidv5 } = require('uuid');

// Fixed namespace for Exprsn ⇄ AT-Protocol DID→UUID mapping. Do not change:
// it would re-key every author.
const DID_NAMESPACE = '7c3e6b1a-2d44-5f8e-9a1b-0c2d4e6f8a10';

/** Deterministic UUIDv5 for a DID, stable across processes. */
function didToUuid(did) {
  return uuidv5(String(did), DID_NAMESPACE);
}

/**
 * Parse an at:// URI into { did, collection, rkey }.
 * e.g. at://did:plc:abc/app.bsky.feed.post/3kxyz → { did, collection, rkey }
 */
function parseAtUri(uri) {
  const m = /^at:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(String(uri || ''));
  if (!m) return null;
  return { did: m[1], collection: m[2], rkey: m[3] };
}

/** Build an at:// URI from its parts. */
function buildAtUri(did, collection, rkey) {
  return `at://${did}/${collection}/${rkey}`;
}

module.exports = { didToUuid, parseAtUri, buildAtUri, DID_NAMESPACE };
