'use strict';

/**
 * Worker-side consumption of the platform config-overrides store (TASK-039).
 *
 * Workers are separate processes (worker:timeline, worker:prefetch, ...) that
 * never run the gateway bootstrap, so they get two mechanisms:
 *   - loadIntoEnv(): call FIRST in the worker entry, before requiring the rest
 *     of the worker — reads platform.config_overrides and patches process.env
 *     (same precedence and env-only fallback as the gateway).
 *   - subscribeChanges(onChange): Redis pub/sub on 'platform:config:changed';
 *     payloads carry {key, restartRequired} only — values never travel over
 *     pub/sub. Hot keys are re-read from the DB and re-applied; restart-required
 *     keys just invoke the callback so the worker can log/flag it.
 *
 * Deliberately dependency-light: pg + ioredis, both platform root deps. Reads
 * connection settings straight from env (this helper runs before any config
 * module is loaded).
 */

const REDIS_CHANNEL = 'platform:config:changed';

function dbSettings() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'exprsn',
    user: process.env.DB_USER || 'exprsn',
    password: process.env.DB_PASSWORD || 'exprsn',
    max: 1,
    connectionTimeoutMillis: 3000,
  };
}

async function fetchOverrides() {
  const { Pool } = require('pg');
  const pool = new Pool(dbSettings());
  try {
    const { rows } = await pool.query('SELECT key, value FROM platform.config_overrides');
    return rows;
  } finally {
    await pool.end().catch(() => {});
  }
}

/**
 * Patch process.env from the store. Never throws; on any failure the worker
 * runs env-only exactly like today. The gateway-side descriptor is the safety
 * authority — but workers can't require src/ (module isolation), so the same
 * validation is enforced structurally: workers only apply keys already present
 * in the store, which the gateway's write path has validated against the
 * descriptor + denylist before persisting.
 */
async function loadIntoEnv(logger = console) {
  if (String(process.env.CONFIG_OVERRIDES_DISABLED || '').toLowerCase() === 'true') return;
  try {
    const rows = await fetchOverrides();
    for (const row of rows) {
      process.env[row.key] = row.value;
    }
    if (rows.length) logger.info(`[config-store] worker applied ${rows.length} override(s)`);
  } catch (err) {
    logger.warn(`[config-store] unavailable in worker (${err.message}) — running env-only`);
  }
}

/**
 * Subscribe to change notifications. onChange({key, restartRequired}) fires
 * after hot keys have been re-applied into process.env.
 */
function subscribeChanges(onChange, logger = console) {
  try {
    const Redis = require('ioredis');
    const sub = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB) || 0,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    sub.subscribe(REDIS_CHANNEL).catch((err) =>
      logger.warn(`[config-store] worker subscribe failed: ${err.message}`),
    );
    sub.on('message', async (channel, message) => {
      if (channel !== REDIS_CHANNEL) return;
      try {
        const event = JSON.parse(message);
        if (!event.restartRequired) {
          // Re-read the store so the worker never trusts pub/sub payloads for
          // values.
          const rows = await fetchOverrides();
          const row = rows.find((r) => r.key === event.key);
          if (row) {
            process.env[event.key] = row.value;
          } else {
            delete process.env[event.key];
          }
        }
        if (typeof onChange === 'function') onChange(event);
      } catch (err) {
        logger.warn(`[config-store] worker change handling failed: ${err.message}`);
      }
    });
    return sub;
  } catch (err) {
    logger.warn(`[config-store] worker subscribe unavailable: ${err.message}`);
    return null;
  }
}

module.exports = { loadIntoEnv, subscribeChanges, REDIS_CHANNEL };
