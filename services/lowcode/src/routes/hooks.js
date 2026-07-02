'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Unauthenticated ingress: webhook-triggered flows (and public forms — WP4).
 *
 * No CA bearer here — each surface carries its own credential:
 *   POST /flows/:appKey/:flowKey — fires a webhook-triggered flow. The caller
 *   presents the flow's shared secret (X-Hook-Token header or ?token=),
 *   compared timing-safe. Rate-limited per flow. The request body becomes
 *   ctx.payload for the flow's condition/actions.
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { LcApp, LcFlow } = require('../models');
const flowEngine = require('../services/flowEngine');

const RATE_LIMIT_PER_MIN = 60;
const hits = new Map(); // key → { count, windowStart }

/** Tiny fixed-window limiter — enough to stop a runaway caller, no Redis dep. */
function rateLimited(key) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.windowStart > 60000) { hits.set(key, { count: 1, windowStart: now }); return false; }
  entry.count += 1;
  if (hits.size > 10000) hits.clear(); // memory backstop
  return entry.count > RATE_LIMIT_PER_MIN;
}

function timingSafeEquals(a, b) {
  const ab = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ab.length !== bb.length || !ab.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

router.post('/flows/:appKey/:flowKey', async (req, res, next) => {
  try {
    if (rateLimited(`flow:${req.params.appKey}:${req.params.flowKey}`)) {
      return res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many webhook deliveries — retry later' });
    }
    const app = await LcApp.findOne({ where: { key: req.params.appKey }, attributes: ['id'] });
    const flow = app && await LcFlow.findOne({ where: { appId: app.id, key: req.params.flowKey } });
    // A single opaque 404 for unknown app/flow, wrong trigger type, disabled
    // flow, or bad token — never help a prober enumerate.
    const trigger = flow && flow.trigger;
    const secret = trigger && trigger.type === 'webhook' && trigger.secret;
    const presented = req.get('x-hook-token') || req.query.token;
    if (!flow || !flow.enabled || !secret || !timingSafeEquals(presented, secret)) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    const ctx = {
      module: 'lowcode', webhook: true, firedAt: new Date().toISOString(),
      payload: req.body, app: flow.appId,
    };
    const run = await flowEngine.runFlow(flow, 'webhook', ctx, { recordSkipped: true });
    res.json({ ok: true, runId: run && run.id, status: run && run.status });
  } catch (e) { next(e); }
});

module.exports = router;
