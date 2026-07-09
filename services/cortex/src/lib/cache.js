'use strict';

/**
 * Chat-completion cache on the shared platform Redis, with graceful
 * degradation: if Redis is unreachable everything is a miss and the module
 * keeps working. Keys are prefixed `cortex:chat:` to stay inside this
 * module's slice of the shared keyspace.
 */

const crypto = require('crypto');
const Redis = require('ioredis');
const { createLogger } = require('@exprsn/shared');
const config = require('../config');

const logger = createLogger('exprsn-cortex');

let client = null;

function initCache() {
  if (client) return client;
  client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 500, 10000),
  });
  client.on('ready', () => logger.info('Cortex cache redis connected'));
  client.on('error', () => { /* retryStrategy keeps trying; misses meanwhile */ });
  return client;
}

const cacheReady = () => Boolean(client && client.status === 'ready');

async function cacheGet(key) {
  if (!cacheReady()) return null;
  try {
    const raw = await client.get(key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds = config.cortex.cacheTtl) {
  if (!cacheReady()) return;
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    /* cache is best-effort */
  }
}

// Stable cache key for a chat request: model + messages + sampling params.
function chatCacheKey(model, messages, opts = {}) {
  const h = crypto
    .createHash('sha256')
    .update(JSON.stringify({ model, messages, opts }))
    .digest('hex');
  return `cortex:chat:${model}:${h}`;
}

module.exports = { initCache, cacheReady, cacheGet, cacheSet, chatCacheKey };
