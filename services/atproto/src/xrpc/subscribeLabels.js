/**
 * ═══════════════════════════════════════════════════════════
 * /xrpc/com.atproto.label.subscribeLabels  (WebSocket event stream)
 *
 * Emits framed `#labels` messages so Bluesky AppViews (and anyone) can subscribe
 * to the labels we issue. Each message is two concatenated dag-cbor objects:
 *   header { op: 1, t: '#labels' }   body { seq, labels: [label] }
 * matching the AT-Protocol event-stream framing used by the repo firehose.
 *
 * On connect we read ?cursor=N and backfill rows with seq > N, then stream live
 * labels from labelBus. To avoid gaps/dupes across the backfill→live handoff we
 * buffer live events during backfill and flush by seq afterwards.
 *
 * Coexists with Socket.IO on the same HTTPS server: src/index.js routes the
 * `upgrade` event by pathname, calling handleUpgrade only for our path.
 * ═══════════════════════════════════════════════════════════
 */

const { WebSocketServer } = require('ws');
const { Op } = require('sequelize');
const logger = require('../../utils/logger');
const labelService = require('../labeler/labelService');
const labelBus = require('../labeler/labelBus');
const { load } = require('../util/esm');

const PATH = '/xrpc/com.atproto.label.subscribeLabels';
const BACKFILL_PAGE = 500;

function createSubscribeLabelsServer(models) {
  const wss = new WebSocketServer({ noServer: true });

  async function frame(seq, label) {
    const { dagCbor } = await load();
    const header = Buffer.from(dagCbor.encode({ op: 1, t: '#labels' }));
    const body = Buffer.from(dagCbor.encode({ seq: Number(seq), labels: [label] }));
    return Buffer.concat([header, body]);
  }

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const cursorParam = url.searchParams.get('cursor');
    let cursor = cursorParam != null && cursorParam !== '' ? cursorParam : null;

    const send = async (row) => {
      if (ws.readyState !== ws.OPEN) return;
      ws.send(await frame(row.seq, labelService.serializeForCbor(row)));
    };

    // Buffer live labels emitted during backfill; flush once caught up.
    let live = [];
    let backfilling = true;
    let lastSent = cursor != null ? BigInt(cursor) : 0n;

    const onLabel = (row) => {
      if (backfilling) live.push(row);
      else if (BigInt(row.seq) > lastSent) {
        lastSent = BigInt(row.seq);
        send(row).catch(() => {});
      }
    };
    labelBus.on('label', onLabel);

    ws.on('close', () => labelBus.removeListener('label', onLabel));
    ws.on('error', () => labelBus.removeListener('label', onLabel));

    try {
      // Page through historical rows with seq > cursor.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const where = cursor != null ? { seq: { [Op.gt]: cursor } } : {};
        // eslint-disable-next-line no-await-in-loop
        const rows = await models.Label.findAll({
          where,
          order: [['seq', 'ASC']],
          limit: BACKFILL_PAGE,
        });
        if (!rows.length) break;
        for (const row of rows) {
          // eslint-disable-next-line no-await-in-loop
          await send(row);
          lastSent = BigInt(row.seq);
        }
        cursor = rows[rows.length - 1].seq;
        if (rows.length < BACKFILL_PAGE) break;
      }

      // Flush anything that arrived live during backfill, in order, de-duped.
      backfilling = false;
      const buffered = live.sort((a, b) => Number(BigInt(a.seq) - BigInt(b.seq)));
      live = [];
      for (const row of buffered) {
        if (BigInt(row.seq) > lastSent) {
          // eslint-disable-next-line no-await-in-loop
          await send(row);
          lastSent = BigInt(row.seq);
        }
      }
    } catch (err) {
      logger.error('subscribeLabels backfill failed', { error: err.message });
      try { ws.close(1011, 'backfill_error'); } catch (_) { /* noop */ }
    }
  });

  return {
    path: PATH,
    /** Called from the server 'upgrade' handler when pathname matches PATH. */
    handleUpgrade(req, socket, head) {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    },
    close() {
      wss.close();
    },
  };
}

module.exports = { createSubscribeLabelsServer, SUBSCRIBE_LABELS_PATH: PATH };
