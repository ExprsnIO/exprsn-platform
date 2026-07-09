'use strict';

// Shared CRUD/build/test/enable router for the tool and skill registries
// (port of the source routes' registerRegistry; tools are test-gated, skills
// are prompt packs). Reads for any token holder; save / build / test / run /
// enable / disable / delete are admin-only — `run` and `enable` execute or
// arm code, and drafts influence every agent once enabled.

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const agent = require('../engine/agent');
const { caRead, caWrite, requireCortexAdmin } = require('../middleware/auth');

function buildRegistryRouter(registry, buildSpecFn, testGated, noun) {
  const router = express.Router();
  const mutate = [caWrite, requireCortexAdmin];
  const base = `/cortex/api/v1/${noun}s`;

  router.get('/', caRead, asyncHandler(async (_req, res) => {
    const brief = (await registry.loadAll()).map((s) => {
      const entry = { name: s.name, enabled: s.enabled ?? false,
                      description: s.description ?? '' };
      if (testGated) {
        entry.kind = s.kind ?? null;
        entry.params = Object.keys((s.parameters || {}).properties || {});
        entry.tests = (s.tests ?? []).length;
      } else {
        entry.recommended_tools = s.recommended_tools ?? [];
      }
      return entry;
    });
    res.json({ [noun + 's']: brief });
  }));

  router.post('/build', mutate, asyncHandler(async (req, res) => {
    const desc = String(req.body.description ?? '').trim();
    if (!desc) return res.status(400).json({ error: 'description required' });
    const opts = { name: req.body.name };
    if (testGated) opts.kind = req.body.kind;
    const { spec, problems } = await buildSpecFn(desc, agent.simpleChat, opts);
    if (!spec || problems.length) {
      return res.status(422).json({ error: 'builder produced an invalid spec',
                                    problems, draft: spec });
    }
    await registry.save(spec, req.userId || null);
    const out = { saved: spec.name, enabled: false, spec };
    if (testGated) {
      out.tests = await registry.runTests(spec);
      out.next = !out.tests.failed
        ? `POST ${base}/${spec.name}/enable`
        : `fix the spec (edit + POST ${base}), then enable`;
    } else {
      out.next = `review the instructions, then POST ${base}/${spec.name}/enable`;
    }
    res.json(out);
  }));

  router.post('/', mutate, asyncHandler(async (req, res) => {
    const spec = req.body;
    if (spec.enabled && testGated) {
      const tests = await registry.runTests(spec);
      if (tests.failed || !tests.results.length) {
        return res.status(400).json({
          error: 'cannot save as enabled: tests must exist and pass', tests });
      }
    }
    try {
      await registry.save(spec, req.userId || null);
    } catch (e) {
      if (e.name === 'ValueError') return res.status(400).json({ error: e.message });
      throw e;
    }
    res.json({ saved: spec.name, enabled: spec.enabled ?? false });
  }));

  router.get('/:name', caRead, asyncHandler(async (req, res) => {
    const spec = await registry.get(req.params.name);
    res.status(spec ? 200 : 404).json(spec || { error: 'not found' });
  }));

  router.delete('/:name', mutate, asyncHandler(async (req, res) => {
    if ((await registry.get(req.params.name)) === null) {
      return res.status(404).json({ error: 'not found' });
    }
    await registry.delete(req.params.name);
    res.json({ deleted: req.params.name });
  }));

  router.post('/:name/:verb', mutate, asyncHandler(async (req, res) => {
    const { name, verb } = req.params;
    const spec = await registry.get(name);
    if (spec === null) return res.status(404).json({ error: 'not found' });
    if (verb === 'test' && testGated) return res.json(await registry.runTests(spec));
    if (verb === 'run' && testGated) {
      try {
        return res.json({ result: await registry.run(spec, (req.body || {}).args) });
      } catch (e) {
        return res.status(400).json({ error: `${e.name || 'Error'}: ${e.message}` });
      }
    }
    if (verb === 'enable') {
      if (testGated) {
        const tests = await registry.runTests(spec);
        if (tests.failed || !tests.results.length) {
          return res.status(400).json({
            error: 'tests must exist and all pass before enabling', tests });
        }
      }
      spec.enabled = true;
      await registry.save(spec, req.userId || null);
      return res.json({ enabled: name });
    }
    if (verb === 'disable') {
      spec.enabled = false;
      await registry.save(spec, req.userId || null);
      return res.json({ disabled: name });
    }
    res.status(404).json({ error: 'not found' });
  }));

  return router;
}

module.exports = { buildRegistryRouter };
