'use strict';

/**
 * Prompt/response telemetry on the cortex.prompt_logs table. Writes are
 * fire-and-forget: logging must never affect the request path.
 */

const { Op } = require('sequelize');
const { PromptLog, sequelize } = require('../models');

function logPrompt({
  channel, sessionId = null, model = null, prompt, response = null,
  usage = null, cached = false, guardrails = null, latencyMs = null,
}) {
  PromptLog.create({
    channel, sessionId, model,
    prompt: prompt ?? null, response, usage, cached, guardrails, latencyMs,
  }).catch(() => { /* fire-and-forget */ });
}

async function queryPromptLog({
  channel = null, session = null, q = null, limit = 100, offset = 0,
} = {}) {
  const where = {};
  if (channel) where.channel = channel;
  if (session) where.sessionId = session;
  if (q) {
    const like = { [Op.iLike]: `%${q}%` };
    where[Op.or] = [
      sequelize.where(sequelize.cast(sequelize.col('prompt'), 'text'), like),
      sequelize.where(sequelize.cast(sequelize.col('response'), 'text'), like),
    ];
  }
  const { rows, count } = await PromptLog.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: Math.min(Number(limit) || 100, 500),
    offset: Number(offset) || 0,
  });
  return { rows, total: count };
}

module.exports = { logPrompt, queryPromptLog };
