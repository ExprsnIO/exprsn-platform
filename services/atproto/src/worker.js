/**
 * ═══════════════════════════════════════════════════════════
 * atproto firehose worker  (npm run worker:atproto)
 *
 * Long-lived process — NOT part of the gateway. Owns the outbound firehose
 * WebSocket, persists the cursor, applies volume control + backpressure, and
 * enqueues moderation jobs. It also registers the 'moderate-atproto' processor
 * so this one process both ingests and moderates (single-writer, so the label
 * `seq` stays ordered). Mirrors services/timeline/src/worker.js conventions.
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();

const config = require('../config');
const logger = require('../utils/logger');
const models = require('../models');
const { createTransport } = require('./ingest/transport');
const { shouldProcess, shouldProcessDelete } = require('./ingest/postFilter');
const { enqueuePost, enqueueNegation, queueDepth } = require('./ingest/enqueue');
const moderationBridge = require('./ingest/moderationBridge');
const { seedFromConfig, reconcile, stopAll } = require('./ingest/labelConsumer');

const RECONCILE_MS = 15000;

const TRANSPORT = config.firehose.transport;
const PERSIST_EVERY = config.firehose.cursorPersistEvery;

let transport = null;
let reconcileTimer = null;
let shuttingDown = false;
let seen = 0;
let enqueued = 0;
let negated = 0;
let dropped = 0;
let sincePersist = 0;
let latestCursor = null;
let shedding = false; // backpressure load-shed state

async function loadCursor() {
  const row = await models.FirehoseCursor.findByPk(TRANSPORT);
  return row ? row.cursor : null;
}

async function persistCursor() {
  if (latestCursor == null) return;
  await models.FirehoseCursor.upsert({ transport: TRANSPORT, cursor: latestCursor });
  sincePersist = 0;
}

// Re-evaluate backpressure roughly every 100 accepted events.
async function maybeUpdateShedding() {
  try {
    const depth = await queueDepth();
    if (!shedding && depth >= config.firehose.backpressureHigh) {
      shedding = true;
      logger.warn('Backpressure: shedding firehose load', { depth });
    } else if (shedding && depth <= config.firehose.backpressureLow) {
      shedding = false;
      logger.info('Backpressure: resuming firehose intake', { depth });
    }
  } catch (err) {
    logger.warn('queueDepth check failed', { error: err.message });
  }
}

async function onEvent(evt) {
  seen += 1;

  // Deletes of posts we'd have labeled → retract our labels (negation).
  if (evt.kind === 'delete') {
    if (shouldProcessDelete(evt)) {
      try {
        await enqueueNegation(evt.uri, 'deleted');
        negated += 1;
      } catch (err) {
        logger.warn('enqueue negation failed', { uri: evt.uri, error: err.message });
      }
    }
    return;
  }

  if (!shouldProcess(evt)) return;

  if (seen % 100 === 0) await maybeUpdateShedding();
  if (shedding) {
    dropped += 1;
    return;
  }

  try {
    await enqueuePost(evt);
    enqueued += 1;
  } catch (err) {
    logger.warn('enqueue failed', { uri: evt.uri, error: err.message });
  }
}

function onCursor(cursor) {
  latestCursor = cursor;
  sincePersist += 1;
  if (sincePersist >= PERSIST_EVERY) persistCursor().catch(() => {});
}

async function main() {
  logger.info('atproto worker starting', {
    transport: TRANSPORT,
    sampleRate: config.firehose.sampleRate,
    allowlist: config.firehose.authorAllowlist.length,
  });

  await models.sequelize.authenticate();
  moderationBridge.register();

  const cursor = await loadCursor();
  if (cursor) logger.info('Resuming from cursor', { transport: TRANSPORT, cursor });

  transport = createTransport({ cursor });
  transport.on('event', (evt) => onEvent(evt).catch((e) => logger.warn('onEvent error', { error: e.message })));
  transport.on('cursor', onCursor);
  transport.on('open', () => logger.info('Firehose connected', { transport: TRANSPORT }));
  transport.on('error', (err) => logger.warn('Firehose error', { error: err.message }));
  transport.connect();

  // External labelers (Bluesky/Ozone or other Exprsn nodes): seed the table from
  // config, then reconcile live consumers against the active rows on an interval
  // so the gateway's subscribe/unsubscribe endpoints take effect without a
  // restart.
  await seedFromConfig(models);
  await reconcile(models);
  reconcileTimer = setInterval(
    () => reconcile(models).catch((err) => logger.warn('labeler reconcile failed', { error: err.message })),
    RECONCILE_MS
  );
  reconcileTimer.unref();

  // Periodic stats + cursor flush.
  setInterval(() => {
    logger.info('atproto worker stats', { seen, enqueued, negated, dropped, shedding, cursor: latestCursor });
    persistCursor().catch(() => {});
  }, 30000).unref();
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — shutting down atproto worker`);
  try {
    transport?.close();
    if (reconcileTimer) clearInterval(reconcileTimer);
    stopAll();
    await persistCursor();
    await models.sequelize.close();
  } catch (err) {
    logger.error('Shutdown error', { error: err.message });
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection', { error: err?.message, stack: err?.stack });
});

main().catch((err) => {
  logger.error('Fatal worker error', { error: err.message, stack: err.stack });
  process.exit(1);
});
