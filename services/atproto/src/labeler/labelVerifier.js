/**
 * ═══════════════════════════════════════════════════════════
 * Inbound label verifier (INGEST side)
 *
 * Verifies labels issued by OTHER labelers — resolve the label's `src` DID to
 * its #atproto_label key, then check the signature over the canonical dag-cbor.
 * did:exprsn issuers resolve offline (self-certifying); did:web are fetched.
 *
 * This is the counterpart to labelSigner (the OUTGEST side): together they let
 * Exprsn nodes exchange signed labels over our own label firehose.
 * ═══════════════════════════════════════════════════════════
 */

const { load } = require('../util/esm');
const { canonicalLabel } = require('./labelSigner');
const didResolver = require('../identity/didResolver');

/**
 * @param {Object} label - { ver, src, uri, cid?, val, neg?, cts, exp?, sig }
 *   where sig is Uint8Array | Buffer | { $bytes: base64 }.
 * @returns {Promise<{ ok: boolean, reason?: string, didKey?: string }>}
 */
async function verifyInboundLabel(label, opts = {}) {
  if (!label || !label.src || !label.sig) return { ok: false, reason: 'missing_src_or_sig' };

  const resolved = await didResolver.resolveDid(label.src, opts);
  if (!resolved) return { ok: false, reason: 'unresolvable_src' };

  const didKey = didResolver.toDidKey(label.src, resolved.publicKeyMultibase);
  if (!didKey) return { ok: false, reason: 'no_label_key' };

  const { dagCbor, crypto } = await load();
  const bytes = dagCbor.encode(canonicalLabel(label));
  const sig = normalizeSig(label.sig);
  if (!sig) return { ok: false, reason: 'bad_sig_encoding' };

  const ok = await crypto.verifySignature(didKey, bytes, sig);
  return { ok, didKey };
}

function normalizeSig(sig) {
  if (sig instanceof Uint8Array) return sig;
  if (Buffer.isBuffer(sig)) return new Uint8Array(sig);
  if (sig && typeof sig.$bytes === 'string') return new Uint8Array(Buffer.from(sig.$bytes, 'base64'));
  if (Array.isArray(sig)) return new Uint8Array(sig);
  return null;
}

module.exports = { verifyInboundLabel };
