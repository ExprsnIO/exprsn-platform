/**
 * ═══════════════════════════════════════════════════════════
 * Label signer
 *
 * Signs com.atproto.label.defs#label objects. Per the AT-Protocol label spec the
 * signature covers the deterministic dag-cbor encoding of the label WITHOUT its
 * `sig` field; the verifying key is the issuer's #atproto_label DID-document key.
 * @atproto/crypto handles k256 + low-S so Bluesky AppViews accept the signature.
 * ═══════════════════════════════════════════════════════════
 */

const { load } = require('../util/esm');
const { getKeypair } = require('./keyManager');

/**
 * Build the canonical, signable label object: defined fields only, with `sig`
 * removed and timestamps coerced to ISO strings. Signer and verifier MUST agree
 * on exactly which fields are present, so undefined/null fields are dropped.
 */
function canonicalLabel(label) {
  const out = {
    ver: label.ver == null ? 1 : label.ver,
    src: label.src,
    uri: label.uri,
    val: label.val,
    cts: toIso(label.cts),
  };
  if (label.cid) out.cid = label.cid;
  if (label.neg) out.neg = true;
  if (label.exp) out.exp = toIso(label.exp);
  return out;
}

function toIso(v) {
  if (!v) return v;
  return v instanceof Date ? v.toISOString() : String(v);
}

/** Sign a label. Returns raw signature bytes (Uint8Array). */
async function signLabel(label) {
  const { dagCbor } = await load();
  const keypair = await getKeypair();
  const bytes = dagCbor.encode(canonicalLabel(label));
  return keypair.sign(bytes);
}

/** Verify a label signature against a did:key (used in tests / on receipt). */
async function verifyLabelSig(didKey, label, sig) {
  const { dagCbor, crypto } = await load();
  const bytes = dagCbor.encode(canonicalLabel(label));
  return crypto.verifySignature(didKey, bytes, sig);
}

module.exports = { signLabel, verifyLabelSig, canonicalLabel };
