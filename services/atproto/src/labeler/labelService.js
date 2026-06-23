/**
 * ═══════════════════════════════════════════════════════════
 * Label service
 *
 * Turns a completed ModerationCase into signed, stored, broadcast labels:
 *   verdictMapper → build label → labelSigner.signLabel → persist Label row
 *   (monotonic seq) → emit on labelBus for live subscribeLabels.
 *
 * SINGLE WRITER: only the atproto worker should call emitForCase, so the
 * BIGSERIAL `seq` commits in order and subscribeLabels cursors stay correct.
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../../utils/logger');
const config = require('../../config');
const { mapVerdict } = require('./verdictMapper');
const { signLabel } = require('./labelSigner');
const identityService = require('./identityService');
const labelBus = require('./labelBus');

let _models = null;
let _srcDidCache = null;

function init(models) {
  _models = models;
}

function models() {
  if (!_models) throw new Error('labelService not initialized — call init(models) first');
  return _models;
}

/** Resolve (and cache) the active labeler DID used as label `src`. */
async function getSrcDid() {
  if (_srcDidCache) return _srcDidCache;
  const active = await identityService.loadActive(models());
  _srcDidCache = (active && active.did) || config.labeler.did || null;
  return _srcDidCache;
}

/**
 * Sign + persist + broadcast a single label.
 * @returns the created Label row, or null if no identity is configured.
 */
async function createLabel({ uri, cid = null, val, neg = false, exp = null, moderationCaseId = null }) {
  const src = await getSrcDid();
  if (!src) {
    logger.warn('Cannot emit label — no labeler identity provisioned', { uri, val });
    return null;
  }
  const cts = new Date();
  const sig = await signLabel({ ver: 1, src, uri, cid, val, neg, cts, exp });

  const row = await models().Label.create({
    ver: 1,
    src,
    uri,
    cid,
    val,
    neg,
    cts,
    exp,
    sig: Buffer.from(sig),
    signingKeyId: 'atproto_label',
    moderationCaseId,
  });

  labelBus.emit('label', row);
  logger.info('Emitted label', { seq: row.seq, val, uri });
  return row;
}

/**
 * Emit labels for a completed moderation case.
 * @param {Object} caseLike - ModerationCase (or toJSON) with scores + action.
 * @param {Object} subject  - { uri, cid, moderationCaseId }
 * @returns {Promise<Array>} created Label rows.
 */
async function emitForCase(caseLike, subject) {
  const { uri, cid = null, moderationCaseId = null } = subject;
  const { vals } = mapVerdict(caseLike);
  const created = [];
  for (const val of vals) {
    // eslint-disable-next-line no-await-in-loop
    const row = await createLabel({ uri, cid, val, moderationCaseId });
    if (row) created.push(row);
  }

  // Track emit state on the uri↔case map (best-effort).
  try {
    const lastSeq = created.length ? created[created.length - 1].seq : null;
    await models().UriCaseMap.update(
      { status: created.length ? 'labeled' : 'moderated', lastLabelSeq: lastSeq },
      { where: { uri } }
    );
  } catch (err) {
    logger.warn('Failed to update uri_case_map after emit', { uri, error: err.message });
  }

  return created;
}

/**
 * Negate (retract) all currently-active labels we've issued for a URI. A label
 * value is "active" if its most recent row for the URI is non-negated. Emits a
 * matching `neg: true` label for each. Idempotent — re-running negates nothing
 * once everything is already retracted. Used on firehose deletes + appeal wins.
 * @returns {Promise<Array>} the negation Label rows created.
 */
async function negateForUri(uri, { reason = null } = {}) {
  const rows = await models().Label.findAll({
    where: { uri },
    order: [['seq', 'ASC']],
  });

  // Latest row per val wins (rows are seq-ascending), so a val is active when
  // its last seen row is not a negation.
  const latestByVal = new Map();
  for (const r of rows) latestByVal.set(r.val, r);
  const active = [...latestByVal.values()].filter((r) => !r.neg);

  const created = [];
  for (const r of active) {
    // eslint-disable-next-line no-await-in-loop
    const negRow = await createLabel({
      uri,
      cid: r.cid,
      val: r.val,
      neg: true,
      moderationCaseId: r.moderationCaseId,
    });
    if (negRow) created.push(negRow);
  }

  if (created.length) {
    await models()
      .UriCaseMap.update(
        { status: 'negated', lastLabelSeq: created[created.length - 1].seq },
        { where: { uri } }
      )
      .catch((err) => logger.warn('uri_case_map negate update failed', { uri, error: err.message }));
  }
  logger.info('Negated labels for uri', { uri, count: created.length, reason });
  return created;
}

/** JSON wire form for queryLabels: bytes as { $bytes: base64 } per atproto. */
function serializeForJson(row) {
  const out = {
    ver: row.ver,
    src: row.src,
    uri: row.uri,
    val: row.val,
    cts: toIso(row.cts),
  };
  if (row.cid) out.cid = row.cid;
  if (row.neg) out.neg = true;
  if (row.exp) out.exp = toIso(row.exp);
  if (row.sig) out.sig = { $bytes: Buffer.from(row.sig).toString('base64') };
  return out;
}

/** CBOR wire form for subscribeLabels: sig as raw bytes (Uint8Array). */
function serializeForCbor(row) {
  const out = {
    ver: row.ver,
    src: row.src,
    uri: row.uri,
    val: row.val,
    cts: toIso(row.cts),
  };
  if (row.cid) out.cid = row.cid;
  if (row.neg) out.neg = true;
  if (row.exp) out.exp = toIso(row.exp);
  if (row.sig) out.sig = new Uint8Array(Buffer.from(row.sig));
  return out;
}

function toIso(v) {
  if (!v) return v;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

module.exports = {
  init,
  getSrcDid,
  createLabel,
  emitForCase,
  negateForUri,
  serializeForJson,
  serializeForCbor,
};
