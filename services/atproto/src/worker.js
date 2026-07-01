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

const crypto = require('crypto');
const rabbit = require('@exprsn/shared/utils/rabbit');
const config = require('../config');
const logger = require('../utils/logger');
const models = require('../models');
const { createTransport } = require('./ingest/transport');
const { shouldProcess, shouldProcessDelete } = require('./ingest/postFilter');
const { enqueuePost, enqueueNegation, queueDepth } = require('./ingest/enqueue');
const { moderationQueue } = require('./ingest/queue');
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

/**
 * Handle a dead-lettered DID moderation item ("moderation support for DIDs").
 *
 * Bounded re-drive: while the item is under maxRedrive, re-enqueue the original
 * 'moderate-atproto' Bull job with an incremented `_redrive`; once exhausted,
 * record it as permanently failed (structured log + best-effort UriCaseMap
 * status='dlq'). This is DID-method-agnostic — the bridge keys off the author
 * DID string, so did:web / did:plc / did:exprsn all flow through the same path.
 *
 * MUST NOT throw: the shared consumer would otherwise treat a throw as a
 * failure and (re-)dead-letter the item.
 */
async function handleDeadLetteredItem(item) {
  try {
    const dlq = config.moderationDlq;
    const uri = item && item.uri;
    const did = item && item.did;
    const redrive = Number(item && item._redrive) || 0;

    if (redrive < dlq.maxRedrive) {
      // Fresh jobId: Bull retains the failed job (removeOnFail age), so reusing
      // the original `atp:<hash(uri)>` id would be deduped and silently dropped.
      const jobId = `atpdlq:${crypto.createHash('sha256').update(`${uri}:${redrive + 1}`).digest('hex')}`;
      await moderationQueue.add(
        'moderate-atproto',
        {
          uri,
          cid: item.cid,
          did,
          collection: item.collection,
          rkey: item.rkey,
          text: item.text,
          langs: item.langs,
          mediaUrl: item.mediaUrl,
          _redrive: redrive + 1,
        },
        {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 86400 },
          removeOnFail: { age: 604800 },
        }
      );
      logger.warn('Moderation DLQ: re-driving DID item', { uri, did, redrive: redrive + 1, maxRedrive: dlq.maxRedrive });
    } else {
      logger.error('Moderation DLQ: DID item permanently failed (review required)', {
        uri,
        did,
        redrive,
        attemptsMade: item && item.attemptsMade,
        error: item && item.error,
      });
      // Best-effort: flag the case row for human review. status is a free string.
      try {
        if (uri) await models.UriCaseMap.update({ status: 'dlq' }, { where: { uri } });
      } catch (err) {
        logger.warn('Moderation DLQ: could not persist dlq status', { uri, error: err.message });
      }
    }
  } catch (err) {
    // Swallow — never let the handler throw back into the consumer.
    logger.error('Moderation DLQ handler error (swallowed)', { error: err && err.message });
  }
}

/**
 * Wire the moderation dead-letter path on the shared Bull queue:
 *   1. assert the RabbitMQ DLQ topology once,
 *   2. on a 'moderate-atproto' job that has exhausted its Bull attempts, publish
 *      the failed DID item to the RabbitMQ DLQ (best-effort, never throws),
 *   3. consume the DLQ to bounded-re-drive / record dead-lettered DID items.
 * No-op when the DLQ is disabled or RabbitMQ is unavailable (Bull path unchanged).
 */
async function setupModerationDlq() {
  const dlq = config.moderationDlq;
  if (!dlq.enabled || !rabbit.isEnabled()) {
    logger.info('Moderation DLQ not active', { enabled: dlq.enabled, rabbit: rabbit.isEnabled() });
    return;
  }
  rabbit.setLogger(logger);

  try {
    // Assert the DLQ queue once (durable, bound to its own exchange). No companion
    // .dlq — our consumer never throws, so it needs no second dead-letter hop.
    await rabbit.assertTopology({
      exchange: dlq.exchange,
      routingKey: dlq.queue,
      queue: dlq.queue,
      durable: true,
      deadLetter: false,
    });
  } catch (err) {
    logger.warn('Moderation DLQ topology assert failed — DLQ disabled this run', { error: err.message });
    return;
  }

  // (2) Route exhausted moderate-atproto failures to the RabbitMQ DLQ. Bull
  // EventEmitter allows multiple 'failed' listeners; the bridge's own listener
  // (which only logs) stays in place.
  moderationQueue.on('failed', (job, err) => {
    if (!job || job.name !== 'moderate-atproto') return;
    const maxAttempts = (job.opts && job.opts.attempts) || 1;
    if (job.attemptsMade < maxAttempts) return; // retries remain — not dead yet
    rabbit
      .sendToQueue(dlq.queue, {
        ...job.data,
        error: err && err.message,
        attemptsMade: job.attemptsMade,
        failedAt: new Date().toISOString(),
      })
      .catch((e) => logger.warn('Moderation DLQ publish failed', { uri: job.data && job.data.uri, error: e.message }));
  });

  // (3) Consume dead-lettered DID items. handler never throws, so deadLetter:false.
  await rabbit.consume(dlq.queue, handleDeadLetteredItem, { prefetch: 4, maxAttempts: 1, deadLetter: false });

  logger.info('Moderation DLQ wired', { queue: dlq.queue, exchange: dlq.exchange, maxRedrive: dlq.maxRedrive });
}

async function main() {
  logger.info('atproto worker starting', {
    transport: TRANSPORT,
    sampleRate: config.firehose.sampleRate,
    allowlist: config.firehose.authorAllowlist.length,
  });

  await models.sequelize.authenticate();
  moderationBridge.register();

  // Dead-letter handling for failed DID/atproto moderation (RabbitMQ). Best-effort:
  // any failure here leaves the existing Bull retry path fully intact.
  try {
    await setupModerationDlq();
  } catch (err) {
    logger.warn('Moderation DLQ setup failed (continuing without DLQ)', { error: err.message });
  }

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
    if (rabbit.isEnabled()) await rabbit.close().catch(() => {});
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
