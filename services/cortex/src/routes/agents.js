'use strict';

/**
 * Agent-definition CRUD + lifecycle + run ledger + NL builder (FEAT-080).
 *
 * Lifecycle: any save lands as `draft`; POST /:idOrName/validate and /enable
 * run the DETERMINISTIC gate (schema valid, referenced tools/skills/guardrails
 * exist, model resolvable on the router) — per the C/B condition there is no
 * LLM-judged gate; POST /:idOrName/smoke records an ADVISORY run that never
 * gates anything. Disabled (non-enabled) agents cannot run.
 *
 * Auth follows FEAT-021 conventions: reads for any token holder; mutations
 * (save/build/delete/validate/enable/disable/smoke) are platform-admin gated.
 * Run + run-ledger routes additionally accept a service HMAC (TASK-062) so
 * other modules can trigger and inspect agent runs over HTTP.
 */

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const agent = require('../engine/agent');
const agents = require('../engine/agents');
const { AgentRun, Tool, Skill, Guardrail } = require('../models');
const { listModels } = require('../lib/llama');
const { newId } = require('../lib/ids');
const { queueAgentRun } = require('../engine/jobs');
const {
  caRead, caWrite, requireCortexAdmin, isAdminReq,
  caReadOrService, caWriteOrService,
} = require('../middleware/auth');

const router = express.Router();
const registry = new agents.AgentRegistry();
const mutate = [caWrite, requireCortexAdmin];

// Reference sets for the deterministic gate. The router is consulted ONLY
// when the spec names a model (null model = brain model, resolvable by
// definition) — so personas and offline specs validate with the router down.
async function gateRefs(spec) {
  const [tools, skills, guardrails] = await Promise.all([
    Tool.findAll({ attributes: ['name'] }),
    Skill.findAll({ attributes: ['name'] }),
    Guardrail.findAll({ attributes: ['name'] }),
  ]);
  let modelIds = null;
  if (spec.model != null) {
    const data = await listModels(); // 503 LLM_UNAVAILABLE if router is down
    modelIds = new Set((data.data || []).map((m) => m.id));
  }
  return {
    toolNames: new Set(tools.map((r) => r.name)),
    skillNames: new Set(skills.map((r) => r.name)),
    guardrailNames: new Set(guardrails.map((r) => r.name)),
    modelIds,
  };
}

function fullView(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    description: row.description ?? '',
    spec: row.spec,
    builtin: row.builtin,
    last_validation: row.lastValidation ?? null,
    // Per-agent guardrail lists are ADVISORY until FEAT-081 — enforcement is
    // the global enabled-guardrails-per-channel engine.
    guardrail_binding: 'advisory (enforcement is global enabled guardrails per channel until FEAT-081)',
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

async function resolveOr404(req, res) {
  const row = await registry.resolve(req.params.idOrName);
  if (!row) res.status(404).json({ error: 'not found' });
  return row;
}

// ---------------------------------------------------------------- CRUD

router.get('/', caRead, asyncHandler(async (_req, res) => {
  const rows = await registry.loadAll();
  res.json({ agents: rows.map(agents.rowToBrief) });
}));

// NL builder (registryFactory /build pattern): draft a spec from plain
// English; ALWAYS saved as a draft — the deterministic gate is the only path
// to enabled.
router.post('/build', mutate, asyncHandler(async (req, res) => {
  const desc = String(req.body.description ?? '').trim();
  if (!desc) return res.status(400).json({ error: 'description required' });
  const { spec, problems } = await agents.buildSpec(
    desc, agent.simpleChat, { name: req.body.name });
  if (!spec || problems.length) {
    return res.status(422).json({ error: 'builder produced an invalid spec',
                                  problems, draft: spec });
  }
  const row = await registry.save(spec, req.userId || null);
  res.json({
    saved: row.name, id: row.id, status: row.status, spec: row.spec,
    next: `POST /cortex/api/v1/agents/${row.name}/validate, then /enable`,
  });
}));

router.post('/', mutate, asyncHandler(async (req, res) => {
  let row;
  try {
    row = await registry.save(req.body, req.userId || null);
  } catch (e) {
    if (e.name === 'ValueError') return res.status(400).json({ error: e.message });
    throw e;
  }
  res.json({ saved: row.name, id: row.id, status: row.status });
}));

router.get('/:idOrName', caRead, asyncHandler(async (req, res) => {
  const row = await resolveOr404(req, res);
  if (row) res.json(fullView(row));
}));

router.delete('/:idOrName', mutate, asyncHandler(async (req, res) => {
  const row = await resolveOr404(req, res);
  if (!row) return;
  if (row.builtin) {
    return res.status(409).json({ error: 'builtin persona agents cannot be deleted (disable instead)' });
  }
  const runCount = await AgentRun.count({ where: { agentId: row.id } });
  if (runCount > 0) {
    return res.status(409).json({
      error: `agent has ${runCount} recorded run(s); run history is preserved — disable the agent instead` });
  }
  await row.destroy();
  res.json({ deleted: row.name });
}));

// ---------------------------------------------------------------- lifecycle

router.post('/:idOrName/validate', mutate, asyncHandler(async (req, res) => {
  const row = await resolveOr404(req, res);
  if (!row) return;
  const problems = agents.gateProblems(row.spec, await gateRefs(row.spec));
  const ok = !problems.length;
  const patch = { lastValidation: { ok, problems, at: new Date().toISOString() } };
  if (ok && row.status === 'draft') patch.status = 'validated';
  if (!ok && row.status !== 'draft') patch.status = 'draft'; // spec no longer passes
  await row.update(patch);
  res.json({ name: row.name, ok, problems, status: row.status });
}));

router.post('/:idOrName/enable', mutate, asyncHandler(async (req, res) => {
  const row = await resolveOr404(req, res);
  if (!row) return;
  // Deterministic gate ONLY (C/B condition): re-run it at enable time.
  const problems = agents.gateProblems(row.spec, await gateRefs(row.spec));
  if (problems.length) {
    await row.update({ status: 'draft',
      lastValidation: { ok: false, problems, at: new Date().toISOString() } });
    return res.status(400).json({ error: 'spec must pass deterministic validation before enabling', problems });
  }
  await row.update({ status: 'enabled',
    lastValidation: { ok: true, problems: [], at: new Date().toISOString() } });
  res.json({ enabled: row.name });
}));

router.post('/:idOrName/disable', mutate, asyncHandler(async (req, res) => {
  const row = await resolveOr404(req, res);
  if (!row) return;
  if (row.status === 'enabled') await row.update({ status: 'validated' });
  res.json({ disabled: row.name, status: row.status });
}));

// Advisory smoke run: records a real run (origin 'smoke') in the ledger so an
// admin can eyeball behavior before enabling. NEVER a gate — enable does not
// read it.
router.post('/:idOrName/smoke', mutate, asyncHandler(async (req, res) => {
  const row = await resolveOr404(req, res);
  if (!row) return;
  const input = String(req.body.input ?? '').trim() ||
    'Smoke test: briefly introduce yourself and state what you can do.';
  const run = await AgentRun.create({
    id: newId('run'), agentId: row.id, origin: 'smoke',
    input, model: req.body.model ?? null, userId: req.userId || null,
  });
  await queueAgentRun(run.id);
  res.status(202).json({ id: run.id, status: run.status, advisory: true });
}));

// ---------------------------------------------------------------- runs

router.post('/:idOrName/run', caWriteOrService, asyncHandler(async (req, res) => {
  const row = await resolveOr404(req, res);
  if (!row) return;
  if (row.status !== 'enabled') {
    return res.status(409).json({ error: `agent is not enabled (status: ${row.status})` });
  }
  const input = String(req.body.input ?? req.body.goal ?? '').trim();
  if (!input) return res.status(400).json({ error: 'input required' });
  const run = await AgentRun.create({
    id: newId('run'), agentId: row.id, origin: 'manual',
    input, model: req.body.model ?? null, userId: req.userId || null,
  });
  await queueAgentRun(run.id);
  res.status(202).json({ id: run.id, status: run.status });
}));

router.get('/:idOrName/runs', caReadOrService, asyncHandler(async (req, res) => {
  const row = await resolveOr404(req, res);
  if (!row) return;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const where = { agentId: row.id,
    ...(isAdminReq(req) ? {} : { userId: req.userId || null }) };
  const { rows, count } = await AgentRun.findAndCountAll({
    where, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit, offset,
  });
  res.json({ agent: row.name, total: count, limit, offset, runs: rows });
}));

router.get('/:idOrName/runs/:runId', caReadOrService, asyncHandler(async (req, res) => {
  const row = await resolveOr404(req, res);
  if (!row) return;
  const run = await AgentRun.findByPk(req.params.runId);
  if (!run || run.agentId !== row.id ||
      (!isAdminReq(req) && (run.userId ?? null) !== (req.userId ?? null))) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json(run);
}));

module.exports = router;
