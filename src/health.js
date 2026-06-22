'use strict';

const os = require('os');
const { execFile } = require('child_process');

const config = require('./config');
const { instances, getSequelize } = require('./db/sequelize');

// Read platform version once at load time.
let pkgVersion = 'unknown';
try {
  // eslint-disable-next-line global-require
  pkgVersion = require('../package.json').version || 'unknown';
} catch (_) { /* ignore */ }

const PROBE_TIMEOUT_MS = 2500;

/**
 * Wrap a promise with a timeout so a hung dependency never stalls /health.
 */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Measure how long `fn` takes and tag the result with a latency string. */
async function timed(fn) {
  const start = Date.now();
  const out = await fn();
  return { ...out, latencyMs: Date.now() - start };
}

// ---- Lazily-created singleton probe clients ---------------------------------
// Built once and reused across requests so /health never leaks connections.

let redisClient;
function getRedisClient() {
  if (redisClient) return redisClient;
  // eslint-disable-next-line global-require
  const Redis = require('ioredis');
  redisClient = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // don't auto-reconnect storm on a dead server
  });
  redisClient.on('error', () => { /* swallow; surfaced per-check */ });
  return redisClient;
}

/**
 * Fetch with a hard timeout via AbortController, returning the parsed JSON body.
 * Used for the HTTP-based probes (Elasticsearch, RabbitMQ management API).
 */
async function fetchJson(url, headers) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { headers, signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

// ---- Individual dependency probes ------------------------------------------

async function checkPostgres() {
  // Reuse a module's live Sequelize instance if one exists; otherwise stand up
  // a throwaway probe instance pinned to the public schema.
  const seq = instances.size > 0 ? instances.values().next().value : getSequelize('public');
  return timed(async () => {
    await seq.authenticate();
    const [verRows] = await seq.query('SELECT version() AS version');
    const [schemaRows] = await seq.query(
      "SELECT count(*)::int AS n FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' AND schema_name <> 'information_schema'"
    );
    return {
      status: 'up',
      version: (verRows[0] && verRows[0].version || '').split(' on ')[0] || undefined,
      database: config.db.name,
      schemas: schemaRows[0] && schemaRows[0].n,
      pool: { min: config.db.poolMin, max: config.db.poolMax },
    };
  });
}

async function checkRedis() {
  const client = getRedisClient();
  return timed(async () => {
    if (client.status === 'wait' || client.status === 'end') await client.connect();
    await client.ping();
    const info = await client.info('server');
    const memInfo = await client.info('memory');
    const verMatch = info.match(/redis_version:(\S+)/);
    const memMatch = memInfo.match(/used_memory_human:(\S+)/);
    return {
      status: 'up',
      version: verMatch ? verMatch[1] : undefined,
      memoryUsed: memMatch ? memMatch[1] : undefined,
      db: config.redis.db,
    };
  });
}

async function checkElasticsearch() {
  // Probe the cluster-health REST endpoint directly rather than through the
  // strict @elastic v8 client, so this works with Elasticsearch- and
  // OpenSearch-compatible servers alike.
  const { node, username, password } = config.elasticsearch;
  const url = `${node.replace(/\/$/, '')}/_cluster/health`;
  const headers = {};
  if (username) headers.Authorization = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  return timed(async () => {
    const body = await fetchJson(url, headers);
    return {
      status: 'up',
      cluster: body.cluster_name,
      clusterStatus: body.status, // green | yellow | red
      nodes: body.number_of_nodes,
      activeShards: body.active_shards,
    };
  });
}

async function checkRabbitmq() {
  const { host, mgmtPort, user, password } = config.rabbitmq;
  const url = `http://${host}:${mgmtPort}/api/overview`;
  const auth = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
  return timed(async () => {
    const body = await fetchJson(url, { Authorization: auth });
    return {
      status: 'up',
      version: body.rabbitmq_version,
      node: body.node,
      erlang: body.erlang_version,
      messages: body.queue_totals && body.queue_totals.messages,
    };
  });
}

/** Run a CLI command, resolving (never rejecting) with its captured output. */
function execCapture(cmd, cmdArgs, timeoutMs) {
  return new Promise((resolve) => {
    execFile(cmd, cmdArgs, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

/**
 * Detect whether Docker is present and the daemon is running, and enumerate the
 * containers (so co-located infra — Postgres, Redis, etc. running as containers
 * — shows up with live per-container status). Degrades gracefully when the
 * docker CLI is absent or the daemon is down.
 */
async function checkDocker() {
  return timed(async () => {
    const ver = await execCapture('docker', ['version', '--format', '{{.Server.Version}}'], PROBE_TIMEOUT_MS);
    if (ver.err) {
      if (ver.err.code === 'ENOENT') {
        return { status: 'unavailable', error: 'docker CLI not installed on host' };
      }
      // CLI exists but daemon unreachable / errored.
      return { status: 'down', error: (ver.stderr.trim() || ver.err.message || 'docker daemon unreachable') };
    }

    const containers = [];
    const ps = await execCapture(
      'docker',
      ['ps', '--all', '--no-trunc', '--format', '{{json .}}'],
      PROBE_TIMEOUT_MS
    );
    if (!ps.err) {
      for (const line of ps.stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const c = JSON.parse(trimmed);
          containers.push({
            name: c.Names,
            image: c.Image,
            state: c.State, // running | exited | created | paused ...
            status: c.Status, // e.g. "Up 2 hours (healthy)"
            ports: c.Ports || '',
          });
        } catch (_) { /* skip unparseable line */ }
      }
      // Running containers first, then alphabetical.
      containers.sort((a, b) => {
        if ((a.state === 'running') !== (b.state === 'running')) return a.state === 'running' ? -1 : 1;
        return String(a.name).localeCompare(String(b.name));
      });
    }

    const running = containers.filter((c) => c.state === 'running').length;
    return {
      status: 'up',
      serverVersion: ver.stdout.trim(),
      containersTotal: containers.length,
      containersRunning: running,
      containers,
    };
  });
}

/**
 * Run a single dependency probe, normalizing success/failure/timeout into a
 * uniform shape. Never throws.
 */
async function runProbe(name, fn) {
  try {
    const result = await withTimeout(fn(), PROBE_TIMEOUT_MS + 500, name);
    return [name, result];
  } catch (err) {
    return [name, { status: 'down', error: err.message }];
  }
}

/**
 * Build the aggregate /health payload: platform metadata, system stats, the
 * mounted modules, and live probes of every backing dependency.
 */
async function collectHealth(loadedModules) {
  const [probeEntries, dockerEntry] = await Promise.all([
    Promise.all([
      runProbe('postgres', checkPostgres),
      runProbe('redis', checkRedis),
      runProbe('elasticsearch', checkElasticsearch),
      runProbe('rabbitmq', checkRabbitmq),
    ]),
    runProbe('docker', checkDocker),
  ]);
  const dependencies = Object.fromEntries(probeEntries);
  const docker = dockerEntry[1];

  // Postgres and Redis are required for the platform to function; the search
  // and broker tiers are optional and only downgrade status to 'degraded'.
  const critical = ['postgres', 'redis'];
  const downCritical = critical.filter((k) => dependencies[k].status !== 'up');
  const downOptional = Object.keys(dependencies).filter(
    (k) => !critical.includes(k) && dependencies[k].status !== 'up'
  );

  let status = 'ok';
  if (downCritical.length > 0) status = 'unhealthy';
  else if (downOptional.length > 0) status = 'degraded';

  const mem = process.memoryUsage();
  const mb = (n) => `${Math.round(n / 1024 / 1024)}MB`;
  const uptimeSeconds = Math.round(process.uptime());

  return {
    status,
    service: 'exprsn-platform',
    serviceName: 'exprsn-platform',
    serverName: os.hostname(),
    domain: process.env.PUBLIC_HOST || `localhost:${config.http.httpsPort}`,
    baseUrl: config.baseUrl,
    version: pkgVersion,
    env: config.env,
    node: process.version,
    pid: process.pid,
    uptimeSeconds,
    // Wall-clock the process actually started, derived from uptime.
    serverStartTime: new Date(Date.now() - uptimeSeconds * 1000).toISOString(),
    time: new Date().toISOString(),
    system: {
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      cpus: os.cpus().length,
      loadAvg: os.loadavg().map((n) => Math.round(n * 100) / 100),
      memory: {
        rss: mb(mem.rss),
        heapUsed: mb(mem.heapUsed),
        heapTotal: mb(mem.heapTotal),
        systemFree: mb(os.freemem()),
        systemTotal: mb(os.totalmem()),
      },
    },
    modules: loadedModules.map((m) => ({
      name: m.name,
      prefix: m.prefix,
      schema: m.schema,
      socketNamespaces: m.socketNs || [],
      mounted: true,
    })),
    dependencies,
    docker,
  };
}

module.exports = { collectHealth };
