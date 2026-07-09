'use strict';

/**
 * Cortex default-content seeder (FEAT-021): loads the vendored guardrail /
 * tool / skill specs from services/cortex/seed-data into the cortex schema.
 * Idempotent — upserts by name, preserving each file's `enabled` flag (these
 * are curated specs whose suites pass; the test gate applies to API
 * mutations).
 *
 * Usage:
 *   npm run seed:cortex          # requires `npm run db:migrate` first
 *
 * Notes:
 *   - reverse-string / word-count are python tools: they seed enabled but
 *     execution stays hard-gated behind CORTEX_PYTHON_TOOLS_ENABLED.
 *   - service-health targets 127.0.0.1, which the SSRF guard blocks unless
 *     CORTEX_TOOL_ALLOW_PRIVATE_HOSTS=true (dev).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
// @exprsn/shared transitively constructs a Stripe client at require time.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_seed_dummy';
require('dotenv').config({ path: path.join(ROOT, '.env') });

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed in production (NODE_ENV=production).');
  process.exit(1);
}

const db = require(path.join(ROOT, 'services/cortex/src/models'));
const grMod = require(path.join(ROOT, 'services/cortex/src/engine/guardrails'));
const tlMod = require(path.join(ROOT, 'services/cortex/src/engine/tools'));
const skMod = require(path.join(ROOT, 'services/cortex/src/engine/skills'));

const SEED_DIR = path.join(ROOT, 'services/cortex/seed-data');

function readSpecs(kind) {
  const dir = path.join(SEED_DIR, kind);
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

async function main() {
  await db.sequelize.authenticate();

  // Guardrail engine without a judge: llm_judge rules are validated
  // structurally; their runtime behavior needs the LLM router.
  const engine = new grMod.GuardrailEngine(null);
  const tools = new tlMod.ToolRegistry();
  const skills = new skMod.SkillRegistry();

  const plans = [
    ['guardrail', readSpecs('guardrails'), (s) => engine.save(s)],
    ['tool', readSpecs('tools'), (s) => tools.save(s)],
    ['skill', readSpecs('skills'), (s) => skills.save(s)],
  ];

  let failed = 0;
  for (const [kind, specs, save] of plans) {
    for (const spec of specs) {
      try {
        await save(spec);
        console.log(`  ✓ ${kind} ${spec.name}${spec.enabled ? ' (enabled)' : ''}`);
      } catch (e) {
        failed++;
        console.error(`  ✗ ${kind} ${spec.name}: ${e.message}`);
      }
    }
  }

  await db.sequelize.close();
  if (failed) {
    console.error(`\n${failed} spec(s) failed to seed.`);
    process.exit(1);
  }
  console.log('\nCortex defaults seeded.');
  // @exprsn/shared leaves a keep-alive handle open at require time; exit
  // explicitly so the one-shot seeder doesn't hang the calling shell.
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
