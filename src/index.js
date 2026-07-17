'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const config = require('./config');
const { MODULES } = require('./modules/registry');
const { buildGateway } = require('./gateway');
const { closeAll } = require('./db/sequelize');
const { initErrorTracking } = require('./observability/errorTracking');

// Minimal logger; modules bring their own winston loggers internally.
const logger = {
  info: (...a) => console.log('[platform]', ...a),
  warn: (...a) => console.warn('[platform]', ...a),
  error: (...a) => console.error('[platform]', ...a),
};

async function loadModules() {
  const loaded = [];
  for (const m of MODULES) {
    // m.entry is written relative to the registry (src/modules/).
    const entryPath = path.resolve(__dirname, 'modules', m.entry);
    try {
      const mod = require(entryPath);
      if (!mod || !mod.app) {
        throw new Error(`module '${m.name}' did not export an { app }`);
      }
      loaded.push({ ...m, module: mod });
      logger.info(`Loaded module '${m.name}' from ${m.entry}`);
    } catch (err) {
      logger.error(`Failed to load module '${m.name}': ${err.stack || err.message}`);
      throw err;
    }
  }
  return loaded;
}

async function initModules(loaded) {
  for (const m of loaded) {
    if (typeof m.module.init === 'function') {
      logger.info(`Initializing module '${m.name}'...`);
      await m.module.init({ config, logger, schema: m.schema });
    }
  }
}

function startHttpRedirect() {
  if (!config.http.httpRedirectPort || !config.tls.enabled) return;
  http
    .createServer((req, res) => {
      const host = (req.headers.host || '').split(':')[0];
      res.writeHead(301, { Location: `https://${host}:${config.http.httpsPort}${req.url}` });
      res.end();
    })
    .listen(config.http.httpRedirectPort, config.http.host, () => {
      logger.info(`HTTP→HTTPS redirect on :${config.http.httpRedirectPort}`);
    });
}

async function main() {
  // Init error tracking first so startup/init failures can be reported too.
  initErrorTracking(config, logger);

  // Apply DB config overrides BEFORE any module is required, so require-time
  // process.env readers see them. Never throws; env-only on DB failure.
  await require('./config/overridesStore').loadAndApply(config, logger);

  const loaded = await loadModules();
  await initModules(loaded);

  const { app, attachSockets } = buildGateway(loaded, logger);

  let server;
  if (config.tlsAvailable()) {
    const opts = {
      cert: fs.readFileSync(config.tls.certPath),
      key: fs.readFileSync(config.tls.keyPath),
    };
    if (config.tls.caPath && fs.existsSync(config.tls.caPath)) {
      opts.ca = fs.readFileSync(config.tls.caPath);
    }
    server = https.createServer(opts, app);
  } else {
    logger.warn('TLS certs not found — starting in plain HTTP. Generate certs with `npm run gen:certs`.');
    server = http.createServer(app);
  }

  attachSockets(server);

  // Let modules attach raw WebSocket servers (e.g. atproto's subscribeLabels)
  // onto the same HTTPS server. They route the 'upgrade' event by pathname, so
  // they coexist with Socket.IO (which ignores non-/socket.io upgrades while
  // another upgrade listener is present).
  for (const m of loaded) {
    if (typeof m.module.attachWsServer === 'function') {
      m.module.attachWsServer(server);
      logger.info(`Attached WS server for '${m.name}'`);
    }
  }

  server.listen(config.http.httpsPort, config.http.host, () => {
    const scheme = config.tlsAvailable() ? 'https' : 'http';
    logger.info(`Exprsn platform listening on ${scheme}://${config.http.host}:${config.http.httpsPort}`);
    logger.info(`Modules: ${loaded.map((m) => m.prefix).join(', ')}`);
  });
  startHttpRedirect();

  const shutdown = async (sig) => {
    logger.info(`${sig} received — shutting down`);
    server.close(async () => {
      await closeAll();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal startup error:', err.stack || err.message);
  process.exit(1);
});
