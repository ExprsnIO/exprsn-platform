'use strict';

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const config = require('../config');
const { listModels } = require('../lib/llama');
const { caRead } = require('../middleware/auth');

const router = express.Router();

router.get('/', caRead, asyncHandler(async (_req, res) => {
  try {
    const data = await listModels();
    const models = (data.data || []).map((m) => ({
      id: m.id,
      status: m.status && m.status.value !== undefined ? m.status.value : m.status,
    }));
    res.json({ models, brain: config.cortex.brainModel });
  } catch (e) {
    res.status(502).json({ error: `router unreachable: ${e.message}` });
  }
}));

module.exports = router;
