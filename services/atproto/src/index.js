/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn atproto Module — AT-Protocol / Bluesky bridge
 * In-process module behind the unified platform gateway.
 *
 * Exports (extends the standard module contract):
 *   name, app                    — JSON ops API mounted at /atproto
 *   init(ctx)                    — light startup (no firehose; that's the worker)
 *   rootApp                      — router mounted at ORIGIN ROOT for the paths
 *                                  AT-Protocol mandates: /.well-known/* and
 *                                  /xrpc/com.atproto.label.queryLabels
 *   attachWsServer(httpServer)   — raw-WS subscribeLabels server, sharing the
 *                                  HTTPS server's 'upgrade' event with Socket.IO
 *
 * The firehose INGEST runs as a separate process (services/atproto/src/worker.js,
 * `npm run worker:atproto`), not here.
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const helmet = require('helmet');

const config = require('../config');
const logger = require('../utils/logger');
const models = require('../models');
const labelService = require('./labeler/labelService');
const { createOpsRouter } = require('./routes/ops');
const { createUserDidsRouter } = require('./routes/userDids');
const { createWellKnownRouter } = require('./wellknown');
const { createQueryLabelsRouter } = require('./xrpc/queryLabels');
const { createResolveDidRouter } = require('./xrpc/resolveDid');
const { createFeedRouter } = require('./xrpc/feed');
const { createSubscribeLabelsServer } = require('./xrpc/subscribeLabels');

// ── Module app (mounted at /atproto) ──────────────────────────────────────
const app = express();
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use('/', createOpsRouter(models));
app.use('/', createUserDidsRouter(models));

// ── Root app (mounted at '/') for AT-Protocol well-known + xrpc HTTP ──────
const rootApp = express();
rootApp.use(express.json({ limit: '1mb' }));
rootApp.use(createWellKnownRouter(models));
rootApp.use(createQueryLabelsRouter(models));
rootApp.use(createResolveDidRouter());
rootApp.use(createFeedRouter(models));

let subscribeServer = null;

async function init() {
  labelService.init(models);
  const hasIdentity = Boolean(config.labeler.did) || Boolean(await models.LabelerIdentity.findOne({ where: { active: true } }).catch(() => null));
  logger.info('atproto module initialized', {
    enabled: config.enabled,
    transport: config.firehose.transport,
    didMethod: config.labeler.didMethod,
    identity: hasIdentity ? 'configured' : 'not provisioned',
  });
}

/**
 * Attach the raw subscribeLabels WebSocket server. Routes the server 'upgrade'
 * event by pathname so it coexists with Socket.IO (which ignores non-/socket.io
 * upgrades as long as another listener is present).
 */
function attachWsServer(httpServer) {
  subscribeServer = createSubscribeLabelsServer(models);
  httpServer.on('upgrade', (req, socket, head) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch (_) {
      return;
    }
    if (pathname === subscribeServer.path) {
      subscribeServer.handleUpgrade(req, socket, head);
    }
    // Other paths (e.g. /socket.io) are left to their own upgrade listeners.
  });
  logger.info('atproto subscribeLabels WS attached', { path: subscribeServer.path });
}

module.exports = {
  name: 'atproto',
  app,
  rootApp,
  init,
  attachWsServer,
};
