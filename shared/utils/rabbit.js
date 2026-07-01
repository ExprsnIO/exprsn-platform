'use strict';

/**
 * Shared RabbitMQ (amqplib) helper.
 *
 * One lazily-established connection + confirm channel per process, with
 * auto-reset on close/error so the next call reconnects. Provides topology
 * assertion (exchange + bound work queue + a companion dead-letter queue),
 * publish, and a consumer with bounded in-queue retries that dead-letters a
 * message to `<queue>.dlq` once attempts are exhausted.
 *
 * The connection URL is RABBITMQ_URL, or built from RABBITMQ_USER/PASSWORD/
 * HOST/PORT/VHOST. Set RABBITMQ_ENABLED=false to make every call a safe no-op
 * (callers should treat a falsy/throwing result as "broker unavailable" and
 * fall back to their primary backend).
 */

let amqp;
try {
  amqp = require('amqplib');
} catch (_) {
  amqp = null;
}

let connPromise = null;
let chanPromise = null;
let logger = console;

function setLogger(l) {
  if (l) logger = l;
}

function isEnabled() {
  return amqp != null && process.env.RABBITMQ_ENABLED !== 'false';
}

function amqpUrl() {
  if (process.env.RABBITMQ_URL) return process.env.RABBITMQ_URL;
  const user = encodeURIComponent(process.env.RABBITMQ_USER || 'guest');
  const pass = encodeURIComponent(process.env.RABBITMQ_PASSWORD || 'guest');
  const host = process.env.RABBITMQ_HOST || 'localhost';
  const port = process.env.RABBITMQ_PORT || '5672';
  const vhost = process.env.RABBITMQ_VHOST ? `/${encodeURIComponent(process.env.RABBITMQ_VHOST)}` : '';
  return `amqp://${user}:${pass}@${host}:${port}${vhost}`;
}

async function getConnection() {
  if (!isEnabled()) throw new Error('RabbitMQ disabled or amqplib unavailable');
  if (connPromise) return connPromise;
  connPromise = amqp
    .connect(amqpUrl(), { clientProperties: { connection_name: process.env.SERVICE_ID || 'exprsn' } })
    .then((conn) => {
      conn.on('error', (err) => logger.warn && logger.warn('RabbitMQ connection error', { error: err.message }));
      conn.on('close', () => {
        logger.warn && logger.warn('RabbitMQ connection closed');
        connPromise = null;
        chanPromise = null;
      });
      return conn;
    })
    .catch((err) => {
      connPromise = null;
      throw err;
    });
  return connPromise;
}

/** A shared confirm channel (publishes wait for broker acks). */
async function getChannel() {
  if (chanPromise) return chanPromise;
  chanPromise = getConnection()
    .then((conn) => conn.createConfirmChannel())
    .then((ch) => {
      ch.on('error', (err) => logger.warn && logger.warn('RabbitMQ channel error', { error: err.message }));
      ch.on('close', () => { chanPromise = null; });
      return ch;
    })
    .catch((err) => {
      chanPromise = null;
      throw err;
    });
  return chanPromise;
}

/** Names derived from a logical queue name. */
function names(queue) {
  return { queue, dlq: `${queue}.dlq` };
}

/**
 * Assert a bucket's topology: a durable direct exchange, a durable work queue
 * bound to it by routingKey, and a durable dead-letter queue `<queue>.dlq`.
 * Idempotent. Returns { exchange, queue, dlq }.
 */
async function assertTopology({ exchange, exchangeType = 'direct', routingKey, queue, durable = true, deadLetter = true }) {
  const ch = await getChannel();
  const rk = routingKey || queue;
  await ch.assertExchange(exchange, exchangeType, { durable });
  const { dlq } = names(queue);
  if (deadLetter) await ch.assertQueue(dlq, { durable: true });
  await ch.assertQueue(queue, { durable });
  await ch.bindQueue(queue, exchange, rk);
  return { exchange, queue, dlq: deadLetter ? dlq : null, routingKey: rk };
}

/** Publish a JSON message to an exchange/routingKey (persistent). */
async function publish(exchange, routingKey, message, opts = {}) {
  const ch = await getChannel();
  const body = Buffer.from(JSON.stringify(message));
  ch.publish(exchange, routingKey, body, { persistent: true, contentType: 'application/json', ...opts });
  await ch.waitForConfirms();
  return true;
}

/** Send a JSON message straight to a queue via the default exchange. */
async function sendToQueue(queue, message, opts = {}) {
  const ch = await getChannel();
  const body = Buffer.from(JSON.stringify(message));
  ch.sendToQueue(queue, body, { persistent: true, contentType: 'application/json', ...opts });
  await ch.waitForConfirms();
  return true;
}

/**
 * Consume a work queue. `handler(payload, raw)` is awaited; on success the
 * message is acked. On throw, the message is retried in-queue up to
 * `maxAttempts` (tracked via the `x-attempts` header); once exhausted it is
 * acked and copied to `<queue>.dlq` with the error attached. Returns the
 * consumerTag.
 */
async function consume(queue, handler, { prefetch = 4, maxAttempts = 3, deadLetter = true } = {}) {
  const ch = await getChannel();
  await ch.prefetch(prefetch);
  const { dlq } = names(queue);
  if (deadLetter) await ch.assertQueue(dlq, { durable: true });

  const { consumerTag } = await ch.consume(queue, async (msg) => {
    if (!msg) return;
    let payload;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch (_) {
      payload = msg.content.toString();
    }
    const attempts = Number(msg.properties.headers && msg.properties.headers['x-attempts']) || 0;
    try {
      await handler(payload, msg);
      ch.ack(msg);
    } catch (err) {
      if (attempts + 1 < maxAttempts) {
        // Bounded in-queue retry: re-publish with an incremented attempt count.
        ch.sendToQueue(queue, msg.content, {
          persistent: true,
          contentType: 'application/json',
          headers: { ...(msg.properties.headers || {}), 'x-attempts': attempts + 1 }
        });
        ch.ack(msg);
      } else if (deadLetter) {
        // Exhausted → dead-letter with diagnostics.
        const dead = Buffer.from(JSON.stringify({ payload, error: err.message, attempts: attempts + 1, failedAt: new Date().toISOString(), queue }));
        ch.sendToQueue(dlq, dead, { persistent: true, contentType: 'application/json' });
        ch.ack(msg);
        logger.warn && logger.warn('Message dead-lettered', { queue, dlq, attempts: attempts + 1, error: err.message });
      } else {
        ch.nack(msg, false, false);
      }
    }
  });
  return consumerTag;
}

/** Message count for a queue (0 if absent/unreachable). */
async function queueDepth(queue) {
  try {
    const ch = await getChannel();
    const { messageCount } = await ch.checkQueue(queue);
    return messageCount;
  } catch (_) {
    return 0;
  }
}

/** Non-destructively read up to `limit` messages from a queue (get + requeue). */
async function peek(queue, limit = 20) {
  const ch = await getChannel();
  const got = [];
  const out = [];
  try {
    for (let i = 0; i < limit; i++) {
      const m = await ch.get(queue, { noAck: false });
      if (!m) break;
      got.push(m);
      try { out.push(JSON.parse(m.content.toString())); } catch (_) { out.push(m.content.toString()); }
    }
  } finally {
    for (const m of got) ch.nack(m, false, true); // requeue so peek is read-only
  }
  return out;
}

/**
 * Move up to `limit` messages from a (dead-letter) queue back onto an exchange.
 * Dead-letter envelopes `{ payload, error, … }` are unwrapped to the original
 * payload. Returns how many were moved.
 */
async function redrive(fromQueue, exchange, routingKey, limit = 100) {
  const ch = await getChannel();
  let moved = 0;
  for (let i = 0; i < limit; i++) {
    const m = await ch.get(fromQueue, { noAck: false });
    if (!m) break;
    let parsed;
    try { parsed = JSON.parse(m.content.toString()); } catch (_) { parsed = null; }
    const original = parsed && parsed.payload !== undefined ? parsed.payload : parsed;
    ch.publish(exchange, routingKey, Buffer.from(JSON.stringify(original)), { persistent: true, contentType: 'application/json' });
    ch.ack(m);
    moved++;
  }
  await ch.waitForConfirms();
  return moved;
}

/** Empty a queue; returns the number of messages purged. */
async function purgeQueue(queue) {
  try {
    const ch = await getChannel();
    const { messageCount } = await ch.purgeQueue(queue);
    return messageCount;
  } catch (_) {
    return 0;
  }
}

async function deleteQueue(queue, { includeDlq = true } = {}) {
  try {
    const ch = await getChannel();
    await ch.deleteQueue(queue);
    if (includeDlq) await ch.deleteQueue(`${queue}.dlq`);
  } catch (_) { /* best effort */ }
}

async function close() {
  try {
    if (chanPromise) { const ch = await chanPromise; await ch.close(); }
  } catch (_) { /* noop */ }
  try {
    if (connPromise) { const c = await connPromise; await c.close(); }
  } catch (_) { /* noop */ }
  connPromise = null;
  chanPromise = null;
}

module.exports = {
  isEnabled,
  amqpUrl,
  setLogger,
  getConnection,
  getChannel,
  assertTopology,
  publish,
  sendToQueue,
  consume,
  queueDepth,
  peek,
  redrive,
  purgeQueue,
  deleteQueue,
  close,
  names
};
