'use strict';

/**
 * Skill registry + builder (port of the MacOS LLM service's agents/skills.js),
 * storage moved from disk JSON to the cortex.skills table.
 *
 * A skill is a reusable instruction pack — markdown the agent follows when
 * the skill is attached to a chat session or task:
 *
 *     {
 *       "name": "concise-writing",
 *       "description": "Write tight, plain prose",   // shown in pickers
 *       "enabled": true,
 *       "instructions": "markdown the agent follows...",
 *       "recommended_tools": ["word-count"]           // optional, informational
 *     }
 *
 * Skills are prompts, not code, so there is no test gate — but LLM-drafted
 * skills (the builder) still save disabled so a human reads them before they
 * influence an agent.
 */

const { Op } = require('sequelize');
const { Skill } = require('../models');
const { namedError } = require('./agent');

const MAX_INSTRUCTIONS = 8000; // chars of one skill injected into a system prompt
const NAME_RE = /^[\w-]{1,64}$/;

// Return a list of problems; empty list means the spec is valid.
function validateSpec(spec) {
  const problems = [];
  if (!NAME_RE.test(String(spec.name ?? ''))) {
    problems.push('name: letters, digits, _ - only (max 64)');
  }
  if (!String(spec.description ?? '').trim()) problems.push('description required');
  if (!String(spec.instructions ?? '').trim()) problems.push('instructions required');
  const rec = spec.recommended_tools ?? [];
  if (!Array.isArray(rec) || !rec.every((t) => typeof t === 'string')) {
    problems.push('recommended_tools must be a list of tool names');
  }
  return problems;
}

// DB row -> plain spec object (same shape as the source JSON files).
function rowToSpec(row) {
  return {
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    instructions: row.instructions,
    recommended_tools: row.recommendedTools ?? [],
    ...(row.builtFrom != null && { built_from: row.builtFrom }),
  };
}

class SkillRegistry {
  async loadAll() {
    const rows = await Skill.findAll({ order: [['name', 'ASC']] });
    return rows.map(rowToSpec);
  }

  async get(name) {
    if (!NAME_RE.test(String(name ?? ''))) return null;
    const row = await Skill.findOne({ where: { name } });
    return row ? rowToSpec(row) : null;
  }

  async save(spec, userId = null) {
    const problems = validateSpec(spec);
    if (problems.length) throw namedError('ValueError', problems.join('; '));
    const values = {
      name: spec.name,
      description: spec.description,
      enabled: Boolean(spec.enabled),
      instructions: spec.instructions,
      recommendedTools: spec.recommended_tools ?? [],
      builtFrom: spec.built_from ?? null,
    };
    const existing = await Skill.findOne({ where: { name: spec.name } });
    if (existing) await existing.update(values);
    else await Skill.create({ ...values, createdBy: userId });
    return spec;
  }

  async delete(name) {
    await Skill.destroy({ where: { name } });
  }

  // System-prompt section for the enabled skills among `names`.
  async promptBlock(names) {
    const wanted = (names || []).filter((n) => NAME_RE.test(String(n ?? '')));
    if (!wanted.length) return '';
    const rows = await Skill.findAll({
      where: { name: { [Op.in]: wanted }, enabled: true },
    });
    const byName = new Map(rows.map((r) => [r.name, r]));
    const parts = [];
    for (const name of wanted) {
      const spec = byName.get(name);
      if (spec) {
        parts.push(`--- skill: ${spec.name} ---\n` +
                   String(spec.instructions).slice(0, MAX_INSTRUCTIONS));
      }
    }
    if (!parts.length) return '';
    return '\n\nSKILLS — follow these additional instructions:\n\n' + parts.join('\n\n');
  }
}

// ---------------------------------------------------------------- builder

const BUILDER_SYSTEM = 'You write skills for a local AI agent system. A skill is ' +
'a reusable instruction pack the agent follows when it is attached to a task ' +
'or chat. Given a description, produce ONE JSON object (no markdown fences, ' +
'no commentary) with exactly these fields:\n' +
'\n' +
'name: short-kebab-case-slug\n' +
'description: one sentence, shown in the skill picker\n' +
'instructions: markdown the agent will follow — concrete and imperative. ' +
'Include: when the skill applies, the method or steps to use, quality bar, ' +
'and 1-2 short examples if they help. 150-400 words.\n' +
'recommended_tools: array of tool names the skill pairs well with (may be [])\n' +
'\n' +
'Return only the JSON object.';

// Draft a skill spec from a natural-language description.
// Returns { spec, problems }. Caller always saves the spec DISABLED.
async function buildSpec(description, chatFn, { name = null } = {}) {
  let user = `Skill: ${description}`;
  if (name) user += `\nUse name: "${name}"`;
  const raw = await chatFn(BUILDER_SYSTEM, user);
  const m = (raw || '').match(/\{[\s\S]*\}/);
  if (!m) return { spec: null, problems: ['model returned no JSON object'] };
  let spec;
  try {
    spec = JSON.parse(m[0]);
  } catch (e) {
    return { spec: null, problems: [`model returned invalid JSON: ${e.message}`] };
  }
  if (name) spec.name = name;
  spec.enabled = false;
  spec.built_from = description;
  return { spec, problems: validateSpec(spec) };
}

module.exports = { validateSpec, SkillRegistry, buildSpec };
