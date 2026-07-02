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
const { LcApp, LcFlow, LcForm, LcEntity } = require('../models');
const flowEngine = require('../services/flowEngine');
const formLayout = require('../services/formLayout');
const entityService = require('../services/entityService');

const RATE_LIMIT_PER_MIN = 60;
const hits = new Map(); // key → { count, windowStart }

/** Tiny fixed-window limiter — enough to stop a runaway caller, no Redis dep. */
function rateLimited(key, max = RATE_LIMIT_PER_MIN) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.windowStart > 60000) { hits.set(key, { count: 1, windowStart: now }); return false; }
  entry.count += 1;
  if (hits.size > 10000) hits.clear(); // memory backstop
  return entry.count > max;
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

// ── Public (anonymous) forms ─────────────────────────────────────────────────

/**
 * Resolve a public form by slug. Requires isPublic AND a PUBLISHED app —
 * draft/archived apps never expose anonymous ingress. One opaque 404 for
 * every failure mode.
 */
async function loadPublicForm(slug) {
  const form = await LcForm.findOne({ where: { slug, isPublic: true } });
  if (!form) return null;
  const app = await LcApp.findByPk(form.appId, { attributes: ['id', 'name', 'status', 'scopeType', 'scopeId'] });
  if (!app || app.status !== 'published') return null;
  const entity = await LcEntity.findOne({ where: { appId: form.appId, key: form.entityKey } });
  if (!entity) return null;
  return { form, app, entity };
}

/** Render spec for an anonymous form (no auth, no design API leakage). */
router.get('/forms/:slug', async (req, res, next) => {
  try {
    if (rateLimited(`formspec:${req.ip}`, 120)) return res.status(429).json({ error: 'RATE_LIMITED' });
    const loaded = await loadPublicForm(req.params.slug);
    if (!loaded) return res.status(404).json({ error: 'NOT_FOUND' });
    const lookups = await entityService.resolveLookups(loaded.entity.appId);
    res.json({ form: formLayout.publicSpec(loaded.form, loaded.entity, lookups), app: { name: loaded.app.name } });
  } catch (e) { next(e); }
});

/**
 * Anonymous submission. Only fields the form's layout exposes are accepted —
 * the layout is the whitelist, so a two-field form over a ten-field entity
 * can't be used to write the other eight. Records land with no owner, scoped
 * to the app's scope, and flow through the exact same validation + storage +
 * hook-bus path as authenticated creates.
 */
router.post('/forms/:slug/submit', async (req, res, next) => {
  try {
    if (rateLimited(`formsubmit:${req.params.slug}:${req.ip}`, 20)) {
      return res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many submissions — retry later' });
    }
    const loaded = await loadPublicForm(req.params.slug);
    if (!loaded) return res.status(404).json({ error: 'NOT_FOUND' });
    const allowed = formLayout.formFieldKeys(loaded.form.layout);
    const data = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.has(k)) data[k] = v;
    const record = await entityService.createRecord(loaded.entity, data, {
      scopeType: loaded.app.scopeType, scopeId: loaded.app.scopeId,
    });
    const settings = loaded.form.settings || {};
    res.status(201).json({ ok: true, id: record.id, message: settings.successMessage || 'Thanks — your response was recorded.' });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: 'VALIDATION', message: e.message, details: e.details });
    next(e);
  }
});

module.exports = router;
