'use strict';

/**
 * DB-backed platform config-overrides store (TASK-039 / ADR).
 *
 * Precedence: DB override > env > code default. `loadAndApply` runs in
 * src/index.js BEFORE any module is required, patching process.env AND the
 * parsed config object, so require-time env readers see overrides for free.
 *
 * Failure posture: boot must succeed with the DB down — any load error logs a
 * warning and continues env-only. CONFIG_OVERRIDES_DISABLED=true skips the
 * store entirely (recovery kill-switch). Invalid or non-descriptor rows are
 * never applied; they're surfaced as anomalies via list().
 *
 * Change fan-out: applied writes patch in-process state (hot keys only), emit
 * on src/config/events, and publish {key, restartRequired} on the Redis
 * channel 'platform:config:changed' so separate worker processes can react
 * (values never travel over pub/sub; workers re-read from the DB).
 */

const { Pool } = require('pg');
const { OVERRIDABLE_KEYS, isDenied, descriptorFor, coerce } = require('./overridableKeys');
const { configEvents } = require('./events');

const TABLE_DDL = `
  CREATE SCHEMA IF NOT EXISTS platform;
  CREATE TABLE IF NOT EXISTS platform.config_overrides (
    key        text PRIMARY KEY,
    value      text NOT NULL,
    is_secret  boolean NOT NULL DEFAULT false,
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    version    integer NOT NULL DEFAULT 1
  );
`;

const REDIS_CHANNEL = 'platform:config:changed';

const state = {
  pool: null,
  logger: console,
  config: null,
  /** effective value applied at boot per key (for pendingRestart detection) */
  appliedAtBoot: new Map(),
  /** pre-override process.env value per key (undefined = was unset) — lets a
   *  hot-key DELETE revert in-process without a restart */
  originalEnv: new Map(),
  /** rows present in DB but invalid/unknown — surfaced by list() */
  anomalies: [],
  loaded: false,
};

function getPool(config) {
  if (!state.pool) {
    state.pool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.name,
      user: config.db.user,
      password: config.db.password,
      max: 2,
      connectionTimeoutMillis: 3000,
    });
    state.pool.on('error', (err) => state.logger.warn(`[config-store] pool error: ${err.message}`));
  }
  return state.pool;
}

function disabled() {
  return String(process.env.CONFIG_OVERRIDES_DISABLED || '').toLowerCase() === 'true';
}

/** Apply one validated override into process.env + the config object. */
function applyValue(desc, coerced) {
  if (!state.originalEnv.has(desc.key)) {
    state.originalEnv.set(desc.key, process.env[desc.key]);
  }
  process.env[desc.key] = String(coerced);
  if (typeof desc.apply === 'function' && state.config) {
    desc.apply(state.config, coerced);
  }
}

/**
 * Load all rows and apply valid ones. Called once at bootstrap, before module
 * require. Never throws.
 */
async function loadAndApply(config, logger) {
  state.config = config;
  state.logger = logger || console;
  if (disabled()) {
    state.logger.warn('[config-store] CONFIG_OVERRIDES_DISABLED=true — running env-only');
    return;
  }
  try {
    const pool = getPool(config);
    await pool.query(TABLE_DDL);
    const { rows } = await pool.query('SELECT key, value, updated_by, updated_at FROM platform.config_overrides');
    for (const row of rows) {
      if (isDenied(row.key)) {
        state.anomalies.push({ key: row.key, reason: 'denylisted key — never applied' });
        continue;
      }
      const desc = descriptorFor(row.key);
      if (!desc) {
        state.anomalies.push({ key: row.key, reason: 'unknown key (not in descriptor)' });
        continue;
      }
      const c = coerce(desc, row.value);
      if (!c.ok) {
        state.anomalies.push({ key: row.key, reason: `invalid value: ${c.error}` });
        continue;
      }
      applyValue(desc, c.value);
      state.appliedAtBoot.set(row.key, String(c.value));
    }
    state.loaded = true;
    const applied = state.appliedAtBoot.size;
    if (applied || state.anomalies.length) {
      state.logger.info(
        `[config-store] applied ${applied} override(s)` +
          (state.anomalies.length ? `, skipped ${state.anomalies.length} anomalous row(s)` : ''),
      );
    }
  } catch (err) {
    state.logger.warn(`[config-store] unavailable (${err.message}) — running env-only`);
  }
}

function maskValue(desc, value) {
  if (desc.isSecret) return value == null ? null : '••••';
  return value;
}

/** Full listing for the admin API: every descriptor key + metadata. */
async function list() {
  let overrides = new Map();
  if (!disabled() && state.pool) {
    try {
      const { rows } = await state.pool.query(
        'SELECT key, value, updated_by, updated_at, version FROM platform.config_overrides',
      );
      overrides = new Map(rows.map((r) => [r.key, r]));
    } catch (err) {
      state.logger.warn(`[config-store] list read failed: ${err.message}`);
    }
  }
  const keys = OVERRIDABLE_KEYS.map((desc) => {
    const row = overrides.get(desc.key) || null;
    const envSet = process.env[desc.key] !== undefined && !state.appliedAtBoot.has(desc.key)
      ? true
      : undefined;
    const effective = process.env[desc.key];
    const source = row ? 'override' : process.env[desc.key] !== undefined ? 'env' : 'default';
    const pendingRestart =
      !desc.hot && row != null && state.appliedAtBoot.get(desc.key) !== String(coerceOr(desc, row.value));
    return {
      key: desc.key,
      module: desc.module,
      type: desc.type,
      values: desc.values || undefined,
      description: desc.description,
      restartRequired: !desc.hot,
      isSecret: !!desc.isSecret,
      source,
      envSet: envSet === true,
      effectiveValue: maskValue(desc, effective),
      override: row
        ? {
            value: maskValue(desc, row.value),
            updatedBy: row.updated_by,
            updatedAt: row.updated_at,
            version: row.version,
          }
        : null,
      pendingRestart,
    };
  });
  return { keys, anomalies: state.anomalies, channel: REDIS_CHANNEL };
}

function coerceOr(desc, raw) {
  const c = coerce(desc, raw);
  return c.ok ? c.value : raw;
}

async function publishChange(payload) {
  try {
    // Lazy ioredis client, only for publishing (fire-and-forget).
    if (!state.pub) {
      const Redis = require('ioredis');
      state.pub = new Redis({
        host: state.config.redis.host,
        port: state.config.redis.port,
        password: state.config.redis.password,
        db: state.config.redis.db,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
    }
    await state.pub.publish(REDIS_CHANNEL, JSON.stringify(payload));
  } catch (err) {
    state.logger.warn(`[config-store] pub/sub publish failed: ${err.message}`);
  }
}

/**
 * Set an override. Returns { status, body } for the REST layer.
 * Applies hot keys immediately in-process; restart-required keys persist and
 * flag pendingRestart.
 */
async function set(key, rawValue, { updatedBy, version } = {}) {
  if (disabled()) return { status: 503, body: { error: 'CONFIG_OVERRIDES_DISABLED' } };
  if (isDenied(key)) return { status: 403, body: { error: 'FORBIDDEN', message: 'key is not overridable' } };
  const desc = descriptorFor(key);
  if (!desc) return { status: 404, body: { error: 'UNKNOWN_KEY' } };
  if (desc.isSecret) return { status: 422, body: { error: 'SECRETS_UNSUPPORTED', message: 'secret keys require CONFIG_STORE_KEY support (not yet enabled)' } };
  const c = coerce(desc, rawValue);
  if (!c.ok) return { status: 422, body: { error: 'INVALID_VALUE', message: c.error } };

  const pool = getPool(state.config);
  const stored = String(c.value);
  const res = version
    ? await pool.query(
        `INSERT INTO platform.config_overrides (key, value, is_secret, updated_by, updated_at, version)
         VALUES ($1, $2, $3, $4, now(), 1)
         ON CONFLICT (key) DO UPDATE SET value=$2, updated_by=$4, updated_at=now(), version=platform.config_overrides.version+1
           WHERE platform.config_overrides.version=$5
         RETURNING version`,
        [key, stored, !!desc.isSecret, updatedBy || null, version],
      )
    : await pool.query(
        `INSERT INTO platform.config_overrides (key, value, is_secret, updated_by, updated_at, version)
         VALUES ($1, $2, $3, $4, now(), 1)
         ON CONFLICT (key) DO UPDATE SET value=$2, updated_by=$4, updated_at=now(), version=platform.config_overrides.version+1
         RETURNING version`,
        [key, stored, !!desc.isSecret, updatedBy || null],
      );
  if (!res.rows.length) return { status: 409, body: { error: 'VERSION_CONFLICT' } };

  let pendingRestart = false;
  if (desc.hot) {
    applyValue(desc, c.value);
    state.appliedAtBoot.set(key, stored);
  } else {
    pendingRestart = state.appliedAtBoot.get(key) !== stored;
  }
  const event = {
    key,
    module: desc.module,
    restartRequired: !desc.hot,
    pendingRestart,
    updatedBy: updatedBy || null,
    updatedAt: new Date().toISOString(),
    action: 'set',
  };
  configEvents.emit('change', event);
  publishChange({ key, restartRequired: !desc.hot });
  return { status: 200, body: { key, version: res.rows[0].version, pendingRestart } };
}

/** Delete an override (revert to env). */
async function remove(key, { updatedBy } = {}) {
  if (disabled()) return { status: 503, body: { error: 'CONFIG_OVERRIDES_DISABLED' } };
  const desc = descriptorFor(key);
  if (!desc) return { status: 404, body: { error: 'UNKNOWN_KEY' } };
  const pool = getPool(state.config);
  const res = await pool.query('DELETE FROM platform.config_overrides WHERE key=$1', [key]);
  if (!res.rowCount) return { status: 404, body: { error: 'NOT_OVERRIDDEN' } };
  let pendingRestart = false;
  if (desc.hot) {
    // Revert in-process to the pre-override env value (or unset + descriptor
    // default via a fresh coerce of the env value if it existed).
    const original = state.originalEnv.get(key);
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
    const c = original !== undefined ? coerce(desc, original) : null;
    if (typeof desc.apply === 'function' && state.config) {
      desc.apply(state.config, c && c.ok ? c.value : original);
    }
    state.appliedAtBoot.delete(key);
  } else {
    pendingRestart = state.appliedAtBoot.has(key);
  }
  const event = {
    key,
    module: desc.module,
    restartRequired: !desc.hot,
    pendingRestart,
    updatedBy: updatedBy || null,
    updatedAt: new Date().toISOString(),
    action: 'delete',
  };
  configEvents.emit('change', event);
  publishChange({ key, restartRequired: !desc.hot });
  return { status: 200, body: { key, reverted: true, pendingRestart } };
}

module.exports = { loadAndApply, list, set, remove, REDIS_CHANNEL };
