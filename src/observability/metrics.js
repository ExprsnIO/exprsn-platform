'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Prometheus metrics for the gateway (SP-5 / R3)
 *
 * Exposes process/runtime default metrics plus HTTP request and Socket.IO
 * connection gauges on a dedicated registry. Scraped at GET /metrics (wired in
 * gateway.js, optionally token-gated). The `route` label is deliberately
 * low-cardinality — the module prefix only (`/spark`, `/auth`, …), never the full
 * path — so per-id paths don't explode the time-series count.
 * ═══════════════════════════════════════════════════════════
 */

const client = require('prom-client');

const register = new client.Registry();
register.setDefaultLabels({ service: 'exprsn-platform' });
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/** Low-cardinality route label: the first path segment (module prefix) only. */
function routeLabel(req) {
  const seg = String(req.path || '/').split('/').filter(Boolean)[0];
  return seg ? `/${seg}` : '/';
}

/** Express middleware that records duration + count for every request. */
function httpMetricsMiddleware(req, res, next) {
  const endTimer = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const labels = { method: req.method, route: routeLabel(req), status_code: String(res.statusCode) };
    endTimer(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
}

/** Register a gauge that reports the live Socket.IO (engine) client count. */
function instrumentSockets(io) {
  // eslint-disable-next-line no-new -- the Gauge self-registers via `registers`
  new client.Gauge({
    name: 'socketio_connected_clients',
    help: 'Currently connected Socket.IO clients (engine level)',
    registers: [register],
    collect() {
      try {
        this.set((io && io.engine && io.engine.clientsCount) || 0);
      } catch (_) {
        this.set(0);
      }
    },
  });
}

/** Express handler for GET /metrics (Prometheus exposition format). */
async function metricsHandler(req, res) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

module.exports = {
  register,
  httpMetricsMiddleware,
  instrumentSockets,
  metricsHandler,
};
