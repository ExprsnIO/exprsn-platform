'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Low-Code Module
 *
 * A full app builder — entities (strongly-typed properties / enums / lookups),
 * forms, and flows (trigger → condition → action) — that runs as its OWN runtime
 * but reuses the plugins module's trust layer (scope, capabilities, condition
 * evaluator, state machine, hook bus). See decisions ledger §Lowcode↔Plugin.
 *
 * Ships behind LOWCODE_ENABLED (default false): tables sync but the flow engine
 * does not subscribe to the hook bus, so the platform is unaffected with the
 * flag off.
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { createLogger } = require('@exprsn/shared');

const db = require('./models');
const flowEngine = require('./services/flowEngine');

const logger = createLogger('exprsn-lowcode');
const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.json({ status: 'ok', module: 'lowcode', enabled: process.env.LOWCODE_ENABLED === 'true' }));
// Distinct prefixes: /api/design is admin-gated (blanket), /api/data is the
// user-facing record runtime — kept separate so the design router's middleware
// never fronts record reads/writes.
app.use('/api/design', require('./routes/design'));
app.use('/api/data', require('./routes/records'));
// Unauthenticated ingress (webhook flows, public forms) — own credentials.
app.use('/api/hooks', require('./routes/hooks'));

app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Endpoint not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Low-code module error', { error: err.message, path: req.path });
  res.status(err.status || 500).json({
    error: err.code || 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
  });
});

async function init() {
  if (process.env.LOWCODE_ENABLED !== 'true') {
    logger.info('Low-code module loaded INERT (LOWCODE_ENABLED!=true)');
    return;
  }
  try {
    await db.sequelize.authenticate();
    if (process.env.NODE_ENV === 'development') await db.sequelize.sync({ alter: true });
    flowEngine.start(); // subscribe flows to the shared plugin hook bus
    await require('./services/flowScheduler').start(); // cron-triggered flows
    logger.info('Low-code module initialized');
  } catch (err) {
    logger.error('Failed to initialize low-code module', { error: err.message });
  }
}

module.exports = { name: 'lowcode', app, init };
