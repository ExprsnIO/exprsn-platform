'use strict';

const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { Server: SocketServer } = require('socket.io');

const config = require('./config');
const overridesStore = require('./config/overridesStore');
const { configEvents } = require('./config/events');
const { requirePlatformAdmin } = require('@exprsn/shared');
const { isAdminToken } = require('@exprsn/shared/middleware/platformAdminGuard');
const { collectHealth } = require('./health');
const { renderHealthPage } = require('./healthPage');
const { httpMetricsMiddleware, instrumentSockets, metricsHandler } = require('./observability/metrics');
const { captureException } = require('./observability/errorTracking');

/**
 * Resolve the CORS origin setting from CORS_ORIGIN (comma-separated allowlist).
 * Unset or '*' yields `false` (same-origin only) — a wildcard origin must never
 * be paired with credentials.
 */
function resolveCorsOrigin(raw) {
  if (!raw || raw === '*') return false;
  const origins = String(raw)
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o && o !== '*');
  return origins.length > 0 ? origins : false;
}

/**
 * Platform config-overrides REST surface (TASK-039). Admin-gated; every write
 * is logged with actor + key (values are never logged — secrets stay masked
 * end-to-end).
 */
function buildConfigOverridesRouter(logger) {
  const router = express.Router();
  router.use(express.json());
  router.use(requirePlatformAdmin);

  router.get('/', async (req, res, next) => {
    try {
      res.json(await overridesStore.list());
    } catch (err) {
      next(err);
    }
  });

  router.put('/:key', async (req, res, next) => {
    try {
      const updatedBy = (req.tokenData && req.tokenData.email) || null;
      const { value, version } = req.body || {};
      if (value === undefined) {
        return res.status(422).json({ error: 'INVALID_VALUE', message: 'body.value is required' });
      }
      const out = await overridesStore.set(req.params.key, value, { updatedBy, version });
      logger.info(
        `[config-store] ${updatedBy || 'unknown'} SET ${req.params.key} -> ${out.status === 200 ? 'ok' : out.body.error}`,
      );
      res.status(out.status).json(out.body);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:key', async (req, res, next) => {
    try {
      const updatedBy = (req.tokenData && req.tokenData.email) || null;
      const out = await overridesStore.remove(req.params.key, { updatedBy });
      logger.info(
        `[config-store] ${updatedBy || 'unknown'} DELETE ${req.params.key} -> ${out.status === 200 ? 'ok' : out.body.error}`,
      );
      res.status(out.status).json(out.body);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * Build the single edge Express app that fronts all domain modules, plus the
 * single Socket.IO server that multiplexes every module's realtime namespace.
 *
 * Returns { app, attachSockets } where attachSockets(httpServer) wires Socket.IO
 * onto the created HTTPS server and lets each module register its namespace.
 */
function buildGateway(loadedModules, logger) {
  const app = express();

  if (config.http.trustProxy) app.set('trust proxy', 1);

  // Restrictive CSP suitable for a JSON API: no sources allowed, no framing.
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
      },
    },
  }));
  const corsOrigin = resolveCorsOrigin(config.http.corsOrigin);
  app.use(cors({ origin: corsOrigin, credentials: true }));
  // Never compress Server-Sent Events (FEAT-090). `text/event-stream` is
  // `compressible`, so the default filter would buffer every frame in the gzip
  // window and the client would see nothing until the stream ended — which
  // looks exactly like a broken backend. The opt-out lives here, once, so any
  // SSE route on any module inherits it rather than rediscovering the trap.
  app.use(compression({
    filter: (req, res) => {
      const type = String(res.getHeader('Content-Type') || '');
      if (type.startsWith('text/event-stream')) return false;
      return compression.filter(req, res);
    },
  }));

  // Record request metrics for every route (incl. /health). Mounted before the
  // routes so the timer wraps the whole handler chain.
  if (config.metrics.enabled) {
    app.use(httpMetricsMiddleware);
  }

  // Aggregate health: platform/system metadata, mounted modules, live probes of
  // every backing dependency (Postgres, Redis, Elasticsearch, RabbitMQ) and the
  // host's Docker containers. Browsers (Accept: text/html) get a live dashboard
  // that streams updates over the `/_health` Socket.IO namespace; every other
  // client gets JSON (503 when a critical dependency is down) — so existing
  // monitors and probes are unaffected.
  app.get('/health', async (req, res) => {
    if (req.accepts(['json', 'html']) === 'html') {
      const nonce = crypto.randomBytes(16).toString('base64');
      // Relax the strict global CSP for this one HTML response so the inline
      // dashboard, the Socket.IO client, and the websocket connection work.
      res.setHeader(
        'Content-Security-Policy',
        `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'nonce-${nonce}'; ` +
          "connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
      );
      res.type('html').send(renderHealthPage(nonce));
      return;
    }
    try {
      const health = await collectHealth(loadedModules);
      res.status(health.status === 'unhealthy' ? 503 : 200).json(health);
    } catch (err) {
      logger.error(`Health check failed: ${err.stack || err.message}`);
      res.status(503).json({ status: 'unhealthy', service: 'exprsn-platform', error: 'health_check_failed' });
    }
  });

  // Prometheus metrics endpoint. Optionally token-gated (METRICS_TOKEN); in any
  // case it should be network-restricted to the scrape target in production.
  if (config.metrics.enabled) {
    app.get('/metrics', (req, res, next) => {
      const token = config.metrics.token;
      if (token && req.get('authorization') !== `Bearer ${token}`) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      return metricsHandler(req, res).catch(next);
    });
  }

  // Platform config-overrides API (TASK-039): gateway-owned, admin-gated,
  // audited. Mounted before the module loop — /platform is not a module prefix.
  app.use('/platform/api/config', buildConfigOverridesRouter(logger));

  // Mount each domain module under its prefix. Each module keeps its own
  // internal route tree (/api/...), so /spark/api/conversations etc.
  for (const m of loadedModules) {
    app.use(m.prefix, m.module.app);
    logger.info(`Mounted module '${m.name}' at ${m.prefix}`);
  }

  // Some modules must also serve a few ORIGIN-ROOT paths that protocols mandate
  // outside any prefix (e.g. atproto's /.well-known/* and /xrpc/*). A module may
  // export `rootApp`, an Express router mounted at '/'. This is the sanctioned
  // exception to the "modules are prefix-scoped JSON APIs" rule.
  for (const m of loadedModules) {
    if (m.module.rootApp) {
      app.use('/', m.module.rootApp);
      logger.info(`Mounted root routes for '${m.name}' at /`);
    }
  }

  // Unknown route.
  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.path });
  });

  // Centralized error handler. Never echo internal error details to clients;
  // log them server-side with a correlation id instead.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    const correlationId = crypto.randomUUID();
    logger.error(`Gateway error [${correlationId}] on ${req.method} ${req.path}: ${err.message}\n${err.stack || ''}`);
    // Report to the error tracker (no-op unless Sentry is configured), keyed by
    // the same correlation id we return to the client.
    captureException(err, { correlationId, method: req.method, path: req.path, status });
    res.status(status).json({
      error: err.code || 'internal_error',
      message: 'An unexpected error occurred',
      correlationId,
    });
  });

  function attachSockets(httpServer) {
    const io = new SocketServer(httpServer, {
      cors: { origin: resolveCorsOrigin(config.http.corsOrigin), credentials: true },
      path: '/socket.io',
    });
    if (config.metrics.enabled) {
      instrumentSockets(io);
    }
    for (const m of loadedModules) {
      if (typeof m.module.registerSockets === 'function') {
        m.module.registerSockets(io);
        logger.info(`Registered sockets for '${m.name}' (ns: ${(m.socketNs || []).join(', ') || 'default'})`);
      }
    }

    // Live health stream consumed by the /health HTML dashboard. A single
    // shared poll fans out to all connected dashboards and only runs while at
    // least one is open, so health probes don't fire when nobody's watching.
    const healthNs = io.of('/_health');
    let pollTimer = null;
    const broadcastHealth = async () => {
      try {
        healthNs.emit('health', await collectHealth(loadedModules));
      } catch (err) {
        logger.error(`Health broadcast failed: ${err.message}`);
      }
    };
    healthNs.on('connection', (socket) => {
      // Send an immediate snapshot to the new client.
      collectHealth(loadedModules)
        .then((h) => socket.emit('health', h))
        .catch((err) => logger.error(`Health snapshot failed: ${err.message}`));
      if (!pollTimer) pollTimer = setInterval(broadcastHealth, 5000);
      socket.on('disconnect', () => {
        if (healthNs.sockets.size === 0 && pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      });
    });
    logger.info('Registered health dashboard socket namespace (/_health)');

    // Admin console live stream (TASK-039): health snapshots + config-change
    // events for the SPA. Unlike /_health this namespace is authenticated —
    // CA bearer via handshake auth, then platform-admin identity.
    const { authenticateSocket } = require('@exprsn/shared/middleware/socketAuth');
    const adminNs = io.of('/_admin');
    adminNs.use(authenticateSocket());
    adminNs.use((socket, nextFn) => {
      if (isAdminToken(socket.tokenData)) return nextFn();
      return nextFn(new Error('FORBIDDEN'));
    });
    let adminPollTimer = null;
    const broadcastAdminHealth = async () => {
      try {
        adminNs.emit('health', await collectHealth(loadedModules));
      } catch (err) {
        logger.error(`Admin health broadcast failed: ${err.message}`);
      }
    };
    adminNs.on('connection', (socket) => {
      collectHealth(loadedModules)
        .then((h) => socket.emit('health', h))
        .catch((err) => logger.error(`Admin health snapshot failed: ${err.message}`));
      if (!adminPollTimer) adminPollTimer = setInterval(broadcastAdminHealth, 5000);
      socket.on('disconnect', () => {
        if (adminNs.sockets.size === 0 && adminPollTimer) {
          clearInterval(adminPollTimer);
          adminPollTimer = null;
        }
      });
    });
    // Bridge config-store changes (masked payloads, no values) to the console.
    configEvents.on('change', (event) => adminNs.emit('config:changed', event));
    logger.info('Registered admin console socket namespace (/_admin)');

    return io;
  }

  return { app, attachSockets };
}

module.exports = { buildGateway };
