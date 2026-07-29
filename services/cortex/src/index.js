'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Cortex Module (FEAT-021)
 *
 * Local-LLM agents, guardrails, skills, and custom tools. Inference runs on
 * an external OpenAI-compatible llama.cpp router (CORTEX_LLM_BASE_URL); every
 * input, output, and tool call is screened by the guardrail engine, and
 * escalations land in a human-review queue instead of going out.
 *
 * Ships behind CORTEX_ENABLED (default false): the module mounts and its
 * tables sync, /cortex/health answers, but every other route returns 503 —
 * so with the flag off NO other module's behavior or cost changes.
 *
 * Auth: every /api/v1 route requires a CA bearer token (validateCAToken);
 * registry mutations, the review queue, and the prompt log are additionally
 * platform-admin gated. Python custom-tool execution is gated separately by
 * CORTEX_PYTHON_TOOLS_ENABLED as the highest-risk surface.
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { createLogger } = require('@exprsn/shared');

const config = require('./config');
const db = require('./models');
const { initCache } = require('./lib/cache');
const { initQueues } = require('./queues');
const { requireEnabled } = require('./middleware/auth');

const logger = createLogger('exprsn-cortex');
const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Public health — answers even while the module ships dark.
app.use('/health', require('./routes/health'));

// Everything else is flag-gated, then CA-token gated per route.
const api = express.Router();
api.use(requireEnabled);
api.use('/models', require('./routes/models'));
api.use('/tasks', require('./routes/tasks'));
api.use('/agents', require('./routes/agents'));
api.use('/chat', require('./routes/chat'));
api.use('/cs', require('./routes/cs'));
api.use('/outbox', require('./routes/outbox'));
api.use('/reviews', require('./routes/reviews'));
api.use('/guardrails', require('./routes/guardrails'));
api.use('/prompts', require('./routes/prompts'));

const { buildRegistryRouter } = require('./routes/registryFactory');
const { TOOLS, SKILLS } = require('./engine/jobs');
const tl = require('./engine/tools');
const sk = require('./engine/skills');
api.use('/tools', buildRegistryRouter(TOOLS, tl.buildSpec, true, 'tool'));
api.use('/skills', buildRegistryRouter(SKILLS, sk.buildSpec, false, 'skill'));

app.use('/api/v1', api);

app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Endpoint not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Engine validation errors carry Python-style names (ValueError etc.) and
  // are client errors, not server faults.
  if (err.name === 'ValueError') {
    return res.status(400).json({ error: err.message });
  }
  const status = err.statusCode || err.status || 500;
  logger.error('Cortex module error', { error: err.message, path: req.path, status });
  res.status(status).json({
    error: err.errorCode || err.code || 'INTERNAL_ERROR',
    message: config.env === 'production' && status >= 500 ? 'An error occurred' : err.message,
  });
});

async function init() {
  if (!config.features.cortexEnabled) {
    logger.info('Cortex module loaded INERT (CORTEX_ENABLED!=true)');
    return;
  }
  try {
    await db.sequelize.authenticate();
    if (config.env === 'development') {
      await db.sequelize.sync({ alter: true });
    }
    initCache();
    initQueues();
    fs.mkdirSync(path.join(config.cortex.dataDir, 'workspaces'), { recursive: true });
    fs.mkdirSync(path.join(config.cortex.dataDir, 'kb'), { recursive: true });
    // FEAT-080: the 3 legacy personas live as (builtin) agent rows; idempotent,
    // never overwrites admin edits.
    await require('./engine/agents').seedLegacyAgents(logger);
    logger.info('Cortex module initialized', {
      llmBaseUrl: config.cortex.llmBaseUrl,
      brain: config.cortex.brainModel,
      pythonTools: config.cortex.pythonToolsEnabled,
      moderate: config.cortex.moderate,
    });
  } catch (err) {
    logger.error('Failed to initialize cortex module', { error: err.message });
    // Non-fatal: the gateway should still boot even if cortex init fails.
  }
}

module.exports = {
  name: 'cortex',
  app,
  init,
};
