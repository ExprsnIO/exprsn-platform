'use strict';

const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { Server: SocketServer } = require('socket.io');

const config = require('./config');
const { collectHealth } = require('./health');
const { renderHealthPage } = require('./healthPage');

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
  app.use(compression());

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

  // Mount each domain module under its prefix. Each module keeps its own
  // internal route tree (/api/...), so /spark/api/conversations etc.
  for (const m of loadedModules) {
    app.use(m.prefix, m.module.app);
    logger.info(`Mounted module '${m.name}' at ${m.prefix}`);
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

    return io;
  }

  return { app, attachSockets };
}

module.exports = { buildGateway };
