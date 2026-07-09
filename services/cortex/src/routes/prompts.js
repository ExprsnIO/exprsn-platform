'use strict';

// Prompt-log query (admin): every LLM prompt/response the module handled.

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const { queryPromptLog } = require('../lib/promptLog');
const { caRead, requireCortexAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', caRead, requireCortexAdmin, asyncHandler(async (req, res) => {
  const { channel, session, q, limit, offset } = req.query;
  res.json(await queryPromptLog({ channel, session, q, limit, offset }));
}));

module.exports = router;
