/**
 * ═══════════════════════════════════════════════════════════
 * Jetstream transport (default)
 *
 * Consumes Bluesky's Jetstream — a JSON projection of the firehose — so no CBOR
 * decoding is needed. Filters server-side via wantedCollections and resumes from
 * a `time_us` cursor. Emits normalized events; auto-reconnects with backoff.
 *
 * Events: 'event' (normalized op), 'cursor' (time_us), 'open', 'close', 'error'.
 * ═══════════════════════════════════════════════════════════
 */

const WebSocket = require('ws');
const { EventEmitter } = require('events');
const config = require('../../config');
const logger = require('../../utils/logger');
const { buildAtUri } = require('../util/identifiers');

class JetstreamTransport extends EventEmitter {
  constructor({ cursor = null } = {}) {
    super();
    this.name = 'jetstream';
    this.cursor = cursor;
    this.ws = null;
    this.closed = false;
    this.backoff = 1000;
  }

  _url() {
    const params = new URLSearchParams();
    for (const c of config.firehose.wantedCollections) params.append('wantedCollections', c);
    if (this.cursor) params.set('cursor', String(this.cursor));
    return `${config.firehose.jetstreamUrl}?${params.toString()}`;
  }

  connect() {
    if (this.closed) return;
    const url = this._url();
    logger.info('Jetstream connecting', { url });
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.backoff = 1000;
      this.emit('open');
    });
    this.ws.on('message', (data) => this._onMessage(data));
    this.ws.on('error', (err) => {
      logger.warn('Jetstream socket error', { error: err.message });
      this.emit('error', err);
    });
    this.ws.on('close', () => {
      this.emit('close');
      if (!this.closed) this._reconnect();
    });
  }

  _reconnect() {
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 30000);
    logger.info('Jetstream reconnecting', { delayMs: delay });
    setTimeout(() => this.connect(), delay).unref?.();
  }

  _onMessage(data) {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (_) {
      return;
    }
    if (msg.time_us) {
      this.cursor = msg.time_us;
      this.emit('cursor', msg.time_us);
    }
    if (msg.kind !== 'commit' || !msg.commit) return;
    const c = msg.commit;
    // operation: 'create' | 'update' | 'delete'
    this.emit('event', {
      kind: c.operation,
      uri: buildAtUri(msg.did, c.collection, c.rkey),
      did: msg.did,
      collection: c.collection,
      rkey: c.rkey,
      cid: c.cid || null,
      record: c.record || null,
      cursor: msg.time_us,
    });
  }

  close() {
    this.closed = true;
    try { this.ws?.close(); } catch (_) { /* noop */ }
  }
}

module.exports = JetstreamTransport;
