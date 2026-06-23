/**
 * ═══════════════════════════════════════════════════════════
 * External labeler consumer (INGEST side of the moderation mesh)
 *
 * Subscribes to other labelers' com.atproto.label.subscribeLabels streams —
 * Bluesky/Ozone or other Exprsn nodes — decodes the framed #labels messages,
 * verifies each label's signature against the issuer's resolved key, and stores
 * it in `inbound_labels`. Resumes per-labeler from the stored cursor.
 *
 * This completes the original brief: "be a firehose to Bluesky's firehose AND
 * moderation service" — the moderation-service (label) inbound direction.
 * ═══════════════════════════════════════════════════════════
 */

const WebSocket = require('ws');
const { Op } = require('sequelize');
const config = require('../../config');
const logger = require('../../utils/logger');
const { loadDecodeFirst } = require('../util/esm');
const { verifyInboundLabel } = require('../labeler/labelVerifier');
const didResolver = require('../identity/didResolver');

const SUBSCRIBE_PATH = '/xrpc/com.atproto.label.subscribeLabels';

/**
 * Resolve a configured labeler entry to { did, wsUrl }.
 *  - did:…  → resolve the #atproto_labeler service endpoint, then wss + path
 *  - http(s)/ws(s) base or full URL → normalized to the subscribeLabels wss URL
 */
async function resolveEntry(entry) {
  if (entry.startsWith('did:')) {
    const resolved = await didResolver.resolveDid(entry);
    const svc = resolved && (resolved.doc.service || []).find((s) => s.type === 'AtprotoLabeler');
    if (!svc) return null;
    return { did: entry, wsUrl: toWsUrl(svc.serviceEndpoint) };
  }
  return { did: null, wsUrl: toWsUrl(entry) };
}

function toWsUrl(base) {
  let u = base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  if (!/^wss?:/.test(u)) u = `wss://${u}`;
  if (!u.includes(SUBSCRIBE_PATH)) u = u.replace(/\/+$/, '') + SUBSCRIBE_PATH;
  return u;
}

class LabelerConsumer {
  constructor(models, { endpoint, did }) {
    this.models = models;
    this.endpoint = endpoint;
    this.did = did;
    this.ws = null;
    this.closed = false;
    this.backoff = 1000;
    this.cursor = null;
  }

  async start() {
    const row = await this.models.ExternalLabeler.findByPk(this.endpoint);
    this.cursor = row ? row.cursor : null;
    await this.models.ExternalLabeler.upsert({ endpoint: this.endpoint, did: this.did, active: true });
    this._connect();
  }

  /** Patch our row (best-effort) — used for live health fields. */
  _update(fields) {
    return this.models.ExternalLabeler.update(fields, { where: { endpoint: this.endpoint } }).catch(() => {});
  }

  _connect() {
    if (this.closed) return;
    const url = this.cursor != null ? `${this.endpoint}?cursor=${this.cursor}` : this.endpoint;
    logger.info('Labeler consumer connecting', { url });
    this.attempts = (this.attempts || 0) + 1;
    this._update({ status: 'connecting', connectAttempts: this.attempts });
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'nodebuffer';

    this.ws.on('open', () => {
      this.backoff = 1000;
      this._update({ status: 'connected', lastConnectedAt: new Date(), lastError: null });
    });
    this.ws.on('message', (data) =>
      this._onFrame(data).catch((err) => logger.warn('inbound frame failed', { error: err.message }))
    );
    this.ws.on('error', (err) => {
      this._update({ lastError: err.message });
    });
    this.ws.on('close', () => {
      this._update({ status: 'disconnected' });
      if (!this.closed) this._reconnect();
    });
  }

  _reconnect() {
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 30000);
    setTimeout(() => this._connect(), delay).unref?.();
  }

  async _onFrame(data) {
    const decodeFirst = await loadDecodeFirst();
    const bytes = new Uint8Array(data);
    const [header, remainder] = decodeFirst(bytes);
    if (!header || header.op !== 1 || header.t !== '#labels') return;
    const [body] = decodeFirst(remainder);
    if (!body || !Array.isArray(body.labels)) return;

    for (const label of body.labels) {
      // eslint-disable-next-line no-await-in-loop
      await this._store(label, body.seq);
    }
    if (typeof body.seq === 'number') {
      this.cursor = body.seq;
      // Same UPDATE carries the cursor + lastEventAt (no extra write).
      await this._update({ cursor: body.seq, lastEventAt: new Date() });
    }
  }

  async _store(label, srcSeq) {
    let verified = false;
    try {
      const result = await verifyInboundLabel(label);
      verified = result.ok === true;
    } catch (_) { /* unverifiable → verified stays false */ }

    if (!verified && config.consume.requireVerified) return; // drop unverified

    const sig = label.sig ? Buffer.from(toBytes(label.sig)) : null;
    await this.models.InboundLabel.create({
      labelerEndpoint: this.endpoint,
      srcSeq,
      ver: label.ver || 1,
      src: label.src,
      uri: label.uri,
      cid: label.cid || null,
      val: label.val,
      neg: Boolean(label.neg),
      cts: label.cts ? new Date(label.cts) : null,
      exp: label.exp ? new Date(label.exp) : null,
      sig,
      verified,
    });

    // Trusted, verified, non-negation labels drive our AI moderation + action.
    if (verified && !label.neg && config.consume.trustedLabelers.includes(label.src)) {
      try {
        // Lazy-require to keep Bull/Redis out of this module's import graph.
        const { enqueueTrustedLabel } = require('./enqueue');
        await enqueueTrustedLabel({ uri: label.uri, src: label.src, val: label.val });
      } catch (err) {
        logger.warn('failed to enqueue trusted label', { uri: label.uri, error: err.message });
      }
    }
  }

  stop() {
    this.closed = true;
    try { this.ws?.close(); } catch (_) { /* noop */ }
  }
}

function toBytes(sig) {
  if (sig instanceof Uint8Array) return sig;
  if (Buffer.isBuffer(sig)) return sig;
  if (sig && typeof sig.$bytes === 'string') return Buffer.from(sig.$bytes, 'base64');
  return Buffer.from(sig);
}

// ── Live consumer manager (WORKER side) ───────────────────────────────────
// The external_labelers table is the source of truth. The worker reconciles its
// live consumers against active rows on an interval, so the gateway's
// subscribe/unsubscribe endpoints take effect without a restart.
const _consumers = new Map(); // endpoint → LabelerConsumer

/** Seed the table from the ATPROTO_SUBSCRIBE_LABELERS config (idempotent). */
async function seedFromConfig(models) {
  for (const entry of config.consume.labelers) {
    // eslint-disable-next-line no-await-in-loop
    const resolved = await resolveEntry(entry);
    if (!resolved) {
      logger.warn('Could not resolve configured labeler entry', { entry });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await models.ExternalLabeler.upsert({ endpoint: resolved.wsUrl, did: resolved.did, active: true });
  }
}

/** Start/stop consumers so they match the active rows. Returns the live count. */
async function reconcile(models) {
  const rows = await models.ExternalLabeler.findAll({ where: { active: true } });
  const wanted = new Set(rows.map((r) => r.endpoint));

  for (const row of rows) {
    if (!_consumers.has(row.endpoint)) {
      const consumer = new LabelerConsumer(models, { endpoint: row.endpoint, did: row.did });
      _consumers.set(row.endpoint, consumer);
      // eslint-disable-next-line no-await-in-loop
      await consumer.start();
      logger.info('Subscribed external labeler', { endpoint: row.endpoint });
    }
  }
  for (const [endpoint, consumer] of _consumers) {
    if (!wanted.has(endpoint)) {
      consumer.stop();
      _consumers.delete(endpoint);
      logger.info('Unsubscribed external labeler', { endpoint });
    }
  }

  // Heartbeat: one batched write so the UI can tell a live worker (fresh
  // heartbeat) from a dead/absent one (stale heartbeat) regardless of label flow.
  const live = [..._consumers.keys()];
  if (live.length) {
    await models.ExternalLabeler.update(
      { heartbeatAt: new Date() },
      { where: { endpoint: { [Op.in]: live } } }
    ).catch(() => {});
  }
  return _consumers.size;
}

/** Stop every live consumer (worker shutdown). */
function stopAll() {
  for (const consumer of _consumers.values()) consumer.stop();
  _consumers.clear();
}

// ── Subscription management (GATEWAY side — DB only, no live sockets here) ──

/** Subscribe to a labeler (DID or wss URL). Resolves + upserts an active row. */
async function subscribe(models, entry) {
  const resolved = await resolveEntry(entry);
  if (!resolved) throw new Error(`could not resolve labeler: ${entry}`);
  await models.ExternalLabeler.upsert({
    endpoint: resolved.wsUrl,
    did: resolved.did,
    active: true,
    status: 'idle',
    lastError: null,
  });
  return models.ExternalLabeler.findByPk(resolved.wsUrl);
}

/** Unsubscribe — deactivate (keeps cursor) or purge the row entirely. */
async function unsubscribe(models, endpoint, { purge = false } = {}) {
  const row = await models.ExternalLabeler.findByPk(endpoint);
  if (!row) return null;
  if (purge) {
    await row.destroy();
    return { endpoint, active: false, purged: true };
  }
  return row.update({ active: false });
}

module.exports = {
  LabelerConsumer,
  resolveEntry,
  toWsUrl,
  SUBSCRIBE_PATH,
  seedFromConfig,
  reconcile,
  stopAll,
  subscribe,
  unsubscribe,
};
