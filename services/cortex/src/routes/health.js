'use strict';

// Public module health — answers even when CORTEX_ENABLED=false so operators
// can see the module is mounted-but-dark.

const express = require('express');
const config = require('../config');
const { routerHealth } = require('../lib/llama');
const { queueStats } = require('../queues');
const { cacheReady } = require('../lib/cache');

const router = express.Router();

router.get('/', async (_req, res) => {
  res.json({
    status: 'ok',
    enabled: config.features.cortexEnabled,
    brain: config.cortex.brainModel,
    judge: config.cortex.judgeModel,
    router: { base: config.cortex.llmBaseUrl, up: await routerHealth() },
    cache: { connected: cacheReady() },
    queue: await queueStats(),
  });
});

module.exports = router;
