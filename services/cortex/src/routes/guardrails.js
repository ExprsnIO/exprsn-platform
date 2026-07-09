'use strict';

// Guardrail registry: reads for any token holder, mutations (save / build /
// test / enable / disable / delete) admin-only. Enabling remains test-gated
// in the engine: the spec's whole test suite must pass first.

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const agent = require('../engine/agent');
const gr = require('../engine/guardrails');
const { ENGINE } = require('../engine/jobs');
const { caRead, caWrite, requireCortexAdmin } = require('../middleware/auth');

const router = express.Router();
const mutate = [caWrite, requireCortexAdmin];

router.get('/', caRead, asyncHandler(async (_req, res) => {
  res.json({ guardrails: (await ENGINE.loadAll()).map((s) => ({
    name: s.name, enabled: s.enabled ?? false, scope: s.scope, action: s.action,
    channels: s.channels ?? null, rules: s.rules.length,
    tests: (s.tests ?? []).length })) });
}));

router.post('/build', mutate, asyncHandler(async (req, res) => {
  const desc = String(req.body.description ?? '').trim();
  if (!desc) return res.status(400).json({ error: 'description required' });
  const { spec, problems } = await gr.buildSpec(desc, agent.simpleChat,
    { name: req.body.name, action: req.body.action });
  if (!spec || problems.length) {
    return res.status(422).json({ error: 'builder produced an invalid spec',
                                  problems, draft: spec });
  }
  await ENGINE.save(spec, req.userId || null);
  const tests = await ENGINE.runTests(spec);
  res.json({
    saved: spec.name, enabled: false, spec, tests,
    next: !tests.failed
      ? `POST /cortex/api/v1/guardrails/${spec.name}/enable`
      : 'fix the spec (edit + POST /cortex/api/v1/guardrails), then enable',
  });
}));

router.post('/', mutate, asyncHandler(async (req, res) => {
  const spec = req.body;
  if (spec.enabled) {
    const tests = await ENGINE.runTests(spec);
    if (tests.failed) {
      return res.status(400).json({ error: 'cannot save as enabled: tests fail', tests });
    }
  }
  try {
    await ENGINE.save(spec, req.userId || null);
  } catch (e) {
    if (e.name === 'ValueError') return res.status(400).json({ error: e.message });
    throw e;
  }
  res.json({ saved: spec.name, enabled: spec.enabled ?? false });
}));

router.get('/:name', caRead, asyncHandler(async (req, res) => {
  const spec = await ENGINE.get(req.params.name);
  res.status(spec ? 200 : 404).json(spec || { error: 'not found' });
}));

router.delete('/:name', mutate, asyncHandler(async (req, res) => {
  if ((await ENGINE.get(req.params.name)) === null) {
    return res.status(404).json({ error: 'not found' });
  }
  await ENGINE.delete(req.params.name);
  res.json({ deleted: req.params.name });
}));

router.post('/:name/:verb', mutate, asyncHandler(async (req, res) => {
  const { name, verb } = req.params;
  const spec = await ENGINE.get(name);
  if (spec === null) return res.status(404).json({ error: 'not found' });
  if (verb === 'test') return res.json(await ENGINE.runTests(spec));
  if (verb === 'enable') {
    const tests = await ENGINE.runTests(spec);
    if (tests.failed) {
      return res.status(400).json({ error: 'tests must all pass before enabling', tests });
    }
    spec.enabled = true;
    await ENGINE.save(spec, req.userId || null);
    return res.json({ enabled: name, tests });
  }
  if (verb === 'disable') {
    spec.enabled = false;
    await ENGINE.save(spec, req.userId || null);
    return res.json({ disabled: name });
  }
  res.status(404).json({ error: 'not found' });
}));

module.exports = router;
