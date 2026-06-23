/**
 * ═══════════════════════════════════════════════════════════
 * subscribeRepos transport (raw firehose)
 *
 * Consumes com.atproto.sync.subscribeRepos directly: binary frames of two
 * concatenated dag-cbor objects (header {op,t} + body). For #commit bodies we
 * read the CAR `blocks` and extract the records for each create/update op. This
 * is the full-fidelity path; it is CPU-heavier than Jetstream, so gate it hard
 * with sampling/allowlist.
 *
 * The CBOR/CAR toolchain is ESM-only and loaded lazily. If it isn't installed,
 * we fail loudly and recommend the jetstream transport.
 *
 * Events: 'event' (normalized op), 'cursor' (seq), 'open', 'close', 'error'.
 * ═══════════════════════════════════════════════════════════
 */

const WebSocket = require('ws');
const { EventEmitter } = require('events');
const config = require('../../config');
const logger = require('../../utils/logger');
const { buildAtUri } = require('../util/identifiers');
const { load, loadDecodeFirst, dynImport } = require('../util/esm');

class SubscribeReposTransport extends EventEmitter {
  constructor({ cursor = null } = {}) {
    super();
    this.name = 'subscribeRepos';
    this.cursor = cursor;
    this.ws = null;
    this.closed = false;
    this.backoff = 1000;
    this._libs = null;
  }

  async _loadLibs() {
    if (this._libs) return this._libs;
    try {
      const [{ dagCbor }, decodeFirst, car] = await Promise.all([
        load(),
        loadDecodeFirst(),
        dynImport('@ipld/car'),
      ]);
      this._libs = { dagCbor, decodeFirst, car };
      return this._libs;
    } catch (err) {
      throw new Error(
        `subscribeRepos transport needs @ipld/dag-cbor + @ipld/car: ${err.message}. ` +
          'Use ATPROTO_FIREHOSE_TRANSPORT=jetstream instead.'
      );
    }
  }

  _url() {
    const base = config.firehose.relayUrl;
    return this.cursor ? `${base}?cursor=${this.cursor}` : base;
  }

  connect() {
    if (this.closed) return;
    const url = this._url();
    logger.info('subscribeRepos connecting', { url });
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'nodebuffer';

    this.ws.on('open', () => {
      this.backoff = 1000;
      this.emit('open');
    });
    this.ws.on('message', (data) => {
      this._onFrame(data).catch((err) => {
        logger.warn('subscribeRepos frame decode failed', { error: err.message });
        this.emit('error', err);
      });
    });
    this.ws.on('error', (err) => this.emit('error', err));
    this.ws.on('close', () => {
      this.emit('close');
      if (!this.closed) this._reconnect();
    });
  }

  _reconnect() {
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 30000);
    setTimeout(() => this.connect(), delay).unref?.();
  }

  async _onFrame(data) {
    const { dagCbor, decodeFirst, car } = await this._loadLibs();
    const bytes = new Uint8Array(data);
    const [header, remainder] = decodeFirst(bytes);
    if (!header || header.op !== 1) return; // op -1 = error frame; ignore others
    const [body] = decodeFirst(remainder);
    if (header.t !== '#commit' || !body || !body.blocks) {
      if (typeof body?.seq === 'number') this._advance(body.seq);
      return;
    }

    this._advance(body.seq);

    let reader;
    try {
      reader = await car.CarReader.fromBytes(body.blocks);
    } catch (err) {
      logger.warn('CAR decode failed', { seq: body.seq, error: err.message });
      return;
    }

    for (const op of body.ops || []) {
      if (op.action !== 'create' && op.action !== 'update') continue;
      const [collection, rkey] = String(op.path).split('/');
      if (!config.firehose.wantedCollections.includes(collection)) continue;
      let record = null;
      try {
        if (op.cid) {
          const block = await reader.get(op.cid);
          if (block) record = dagCbor.decode(block.bytes);
        }
      } catch (err) {
        logger.warn('record block decode failed', { path: op.path, error: err.message });
      }
      this.emit('event', {
        kind: op.action,
        uri: buildAtUri(body.repo, collection, rkey),
        did: body.repo,
        collection,
        rkey,
        cid: op.cid ? op.cid.toString() : null,
        record,
        cursor: body.seq,
      });
    }
  }

  _advance(seq) {
    if (typeof seq === 'number') {
      this.cursor = seq;
      this.emit('cursor', seq);
    }
  }

  close() {
    this.closed = true;
    try { this.ws?.close(); } catch (_) { /* noop */ }
  }
}

module.exports = SubscribeReposTransport;
