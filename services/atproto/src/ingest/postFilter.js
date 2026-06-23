/**
 * ═══════════════════════════════════════════════════════════
 * Post filter — volume control before the moderation pipeline
 *
 * The full firehose is millions of events/day; moderating all of them would
 * swamp the AI providers. We drop everything that isn't a create/update of a
 * wanted collection with text, then apply an author allowlist and deterministic
 * sampling (hash of the URI, so the same post always makes the same cut → keeps
 * dedup/idempotency intact across reconnects).
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const config = require('../../config');

/** Deterministic fraction in [0,1) from the URI. */
function uriFraction(uri) {
  const h = crypto.createHash('sha256').update(String(uri)).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}

function shouldProcess(evt) {
  if (!evt) return false;
  if (evt.kind !== 'create' && evt.kind !== 'update') return false;
  if (!config.firehose.wantedCollections.includes(evt.collection)) return false;
  if (!evt.record || typeof evt.record.text !== 'string' || evt.record.text.trim() === '') return false;

  const allow = config.firehose.authorAllowlist;
  if (allow.length && !allow.includes(evt.did)) return false;

  const rate = config.firehose.sampleRate;
  if (rate < 1 && uriFraction(evt.uri) >= rate) return false;

  return true;
}

/**
 * Whether a DELETE event should trigger label negation. Uses the SAME
 * collection/allowlist/sample gate as creates (deterministic by URI), so we only
 * act on deletes of posts we would have labeled — keeping volume proportional.
 */
function shouldProcessDelete(evt) {
  if (!evt || evt.kind !== 'delete') return false;
  if (!config.firehose.wantedCollections.includes(evt.collection)) return false;

  const allow = config.firehose.authorAllowlist;
  if (allow.length && !allow.includes(evt.did)) return false;

  const rate = config.firehose.sampleRate;
  if (rate < 1 && uriFraction(evt.uri) >= rate) return false;

  return true;
}

module.exports = { shouldProcess, shouldProcessDelete, uriFraction };
