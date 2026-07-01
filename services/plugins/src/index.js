'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Plugins Module
 *
 * A first-class, scoped, capability-gated extension framework. A plugin is DATA
 * (a manifest row) evaluated by the platform's own trusted engines — never
 * foreign code loaded into the gateway. Four execution kinds:
 *   declarative · webhook · script (sandboxed JS) · internal (post-MVP).
 *
 * Ships behind PLUGINS_ENABLED (default false): the module mounts and its tables
 * sync, but the hook bus is inert (emit() returns before any work) and no
 * builtins are seeded — so with the flag off NO other module's behavior or cost
 * changes. Sandboxed `script` execution is additionally gated by
 * PLUGINS_SCRIPT_ENABLED.
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { createLogger } = require('@exprsn/shared');

const db = require('./models');
const pluginHost = require('./services/pluginHost');
const lifecycle = require('./services/lifecycleService');
const { BUILTINS } = require('./builtin');

const logger = createLogger('exprsn-plugins');
const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({
  limit: '2mb',
  // Preserve the raw body so inbound plugin callbacks can verify HMAC signatures.
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));

// Routes (JSON API only)
app.use('/health', require('./routes/health'));
app.use('/api/plugins', require('./routes/catalog'));
app.use('/api/installations', require('./routes/installations'));
app.use('/api/endpoints', require('./routes/endpoints'));
app.use('/api/deliveries', require('./routes/deliveries'));
app.use('/api/surfaces', require('./routes/surfaces'));
app.use('/api/registry', require('./routes/registry'));
app.use('/api/callback', require('./routes/callback'));

app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Endpoint not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Plugins module error', { error: err.message, path: req.path });
  res.status(err.status || 500).json({
    error: err.code || 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
  });
});

/** Seed builtin plugins into the catalog (idempotent). Not auto-installed. */
async function seedBuiltins() {
  for (const manifest of BUILTINS) {
    try {
      await lifecycle.register(manifest, { source: 'builtin' });
    } catch (err) {
      logger.warn(`Failed to seed builtin plugin '${manifest.key}'`, { error: err.message });
    }
  }
  logger.info(`Seeded ${BUILTINS.length} builtin plugin(s)`);
}

async function init() {
  const enabled = process.env.PLUGINS_ENABLED === 'true';
  if (!enabled) {
    logger.info('Plugins module loaded INERT (PLUGINS_ENABLED!=true)');
    return;
  }
  try {
    await db.sequelize.authenticate();
    if (process.env.NODE_ENV === 'development') {
      await db.sequelize.sync({ alter: true });
    }
    await seedBuiltins();
    logger.info('Plugins module initialized', {
      scriptEnabled: process.env.PLUGINS_SCRIPT_ENABLED === 'true',
    });
  } catch (err) {
    logger.error('Failed to initialize plugins module', { error: err.message });
    // Non-fatal: the gateway should still boot even if plugins init fails.
  }
}

module.exports = {
  name: 'plugins',
  app,
  init,
  // Exposed for other modules to emit/subscribe through the shared hook bus.
  pluginHost,
};
