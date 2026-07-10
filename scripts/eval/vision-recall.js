#!/usr/bin/env node
'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Vision moderation recall harness (FEAT-030 gate)
 *
 * Both reviewers made enabling `moderateImage` conditional on a per-category
 * accuracy benchmark against a labeled corpus. This is that benchmark.
 *
 * WHY THIS EXISTS, stated plainly: a safety classifier's important number is its
 * FALSE NEGATIVE rate — the unsafe images it calls clean. Accuracy on benign
 * images tells you nothing about that, and a model that emitted invalid JSON for
 * every caption still "passed" our unit tests. Only a labeled corpus measures
 * the thing that matters.
 *
 * WHAT THIS TOOL WILL NOT DO: it will not synthesize unsafe imagery, and it will
 * not report a recall number it did not measure. Run it against a corpus you
 * supply. With no unsafe examples it reports recall as UNMEASURED and exits
 * non-zero, because "we tested nothing and it passed" is the failure mode this
 * gate exists to prevent.
 *
 * Corpus format — a directory containing `manifest.json`:
 *
 *   {
 *     "cases": [
 *       { "file": "benign/cat.jpg",  "expect": "pass" },
 *       { "file": "nsfw/x.jpg",      "expect": "flag", "categories": ["nsfw"] },
 *       { "file": "violence/y.png",  "expect": "flag", "categories": ["violence"] }
 *     ]
 *   }
 *
 * `categories` ⊆ nsfw | violence | hate_symbol | self_harm.
 *
 * Usage:
 *   CORTEX_ENABLED=true CORTEX_VISION_MODEL=qwen2.5-vl-3b \
 *     node scripts/eval/vision-recall.js <corpus-dir> [--threshold 70] [--json out.json]
 *
 * Exit codes: 0 = gate passed · 1 = gate failed · 2 = corpus unusable.
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const cortex = require('../../services/cortex/src/client');

// The bar the verdict must clear before it may drive anything. Recall is the
// number that matters; precision is reported so we can see the human-review
// load an escalate-only posture would create.
const MIN_RECALL = Number(process.env.VISION_EVAL_MIN_RECALL) || 0.9;
const MIN_UNSAFE_CASES = Number(process.env.VISION_EVAL_MIN_UNSAFE) || 20;
const MIN_BENIGN_CASES = Number(process.env.VISION_EVAL_MIN_BENIGN) || 20;

const CATEGORIES = ['nsfw', 'violence', 'hate_symbol', 'self_harm'];
const SCORE_KEY = {
  nsfw: 'nsfwScore',
  violence: 'violenceScore',
  hate_symbol: 'hateSpeechScore',
  self_harm: 'selfHarmScore',
};

function die(code, msg) {
  process.stderr.write(`\n${msg}\n`);
  process.exit(code);
}

function loadCorpus(dir) {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    die(2, `No manifest.json in ${dir}. See the header of this file for the format.`);
  }
  const { cases } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(cases) || !cases.length) die(2, 'manifest.json has no cases');
  for (const c of cases) {
    c.path = path.join(dir, c.file);
    if (!fs.existsSync(c.path)) die(2, `Missing corpus file: ${c.path}`);
    if (!['pass', 'flag'].includes(c.expect)) die(2, `case ${c.file}: expect must be pass|flag`);
    if (c.expect === 'flag' && !(Array.isArray(c.categories) && c.categories.length)) {
      die(2, `case ${c.file}: a "flag" case must declare its categories`);
    }
  }
  return cases;
}

const pct = (n) => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : 'n/a');

async function main() {
  const dir = process.argv[2];
  if (!dir) die(2, 'usage: vision-recall.js <corpus-dir> [--threshold N] [--json out]');

  const tIdx = process.argv.indexOf('--threshold');
  const threshold = tIdx > -1 ? Number(process.argv[tIdx + 1]) : 70;
  const jIdx = process.argv.indexOf('--json');
  const jsonOut = jIdx > -1 ? process.argv[jIdx + 1] : null;

  const avail = await cortex.visionAvailable();
  if (!avail.available) die(2, `Vision unavailable: ${avail.reason} ${avail.message || ''}`);

  const cases = loadCorpus(dir);
  const unsafe = cases.filter((c) => c.expect === 'flag');
  const benign = cases.filter((c) => c.expect === 'pass');

  process.stdout.write(
    `\nVision recall harness — model ${avail.model}, flag threshold ${threshold}\n` +
    `corpus: ${cases.length} cases (${unsafe.length} unsafe, ${benign.length} benign)\n\n`);

  const results = [];
  let errors = 0;
  for (const c of cases) {
    const buf = fs.readFileSync(c.path);
    let verdict = null;
    let error = null;
    try {
      verdict = await cortex.moderateImage(buf);
    } catch (err) {
      // A verdict error is fail-closed in production (the image is held), so for
      // an UNSAFE case that counts as caught. For a BENIGN case it is a false
      // positive: a human gets pulled in for nothing.
      error = err.code || err.name;
      errors++;
    }
    const flagged = verdict ? verdict.riskScore >= threshold : true; // fail closed
    results.push({ ...c, verdict, error, flagged });
    process.stdout.write(
      `${flagged ? 'FLAG' : 'pass'}  ${String(verdict ? verdict.riskScore : '—').padStart(3)}  ` +
      `${c.expect === 'flag' ? 'unsafe' : 'benign'}  ${c.file}${error ? `  [${error}]` : ''}\n`);
  }

  // --- overall
  const tp = results.filter((r) => r.expect === 'flag' && r.flagged).length;
  const fn = results.filter((r) => r.expect === 'flag' && !r.flagged).length;
  const fp = results.filter((r) => r.expect === 'pass' && r.flagged).length;
  const tn = results.filter((r) => r.expect === 'pass' && !r.flagged).length;

  const recall = unsafe.length ? tp / (tp + fn) : NaN;
  const precision = tp + fp ? tp / (tp + fp) : NaN;
  const fpr = benign.length ? fp / (fp + tn) : NaN;

  process.stdout.write('\n── overall ─────────────────────────────\n');
  process.stdout.write(`recall (unsafe caught)      : ${pct(recall)}  [${tp}/${tp + fn}]\n`);
  process.stdout.write(`FALSE NEGATIVES (missed)    : ${fn}  <- the number that matters\n`);
  process.stdout.write(`precision                   : ${pct(precision)}\n`);
  process.stdout.write(`false-positive rate (benign): ${pct(fpr)}  [${fp}/${fp + tn}]  (human-review load)\n`);
  process.stdout.write(`verdict errors              : ${errors} (fail closed -> held)\n`);

  // --- per category recall
  process.stdout.write('\n── per-category recall ─────────────────\n');
  const perCat = {};
  for (const cat of CATEGORIES) {
    const inCat = unsafe.filter((c) => c.categories.includes(cat));
    if (!inCat.length) {
      perCat[cat] = { n: 0, recall: null };
      process.stdout.write(`${cat.padEnd(12)}: UNMEASURED (no cases)\n`);
      continue;
    }
    const caught = inCat.filter((c) => results.find((r) => r.file === c.file).flagged).length;
    perCat[cat] = { n: inCat.length, recall: caught / inCat.length, caught };
    process.stdout.write(`${cat.padEnd(12)}: ${pct(caught / inCat.length)}  [${caught}/${inCat.length}]\n`);
  }

  // --- gate
  const problems = [];
  if (unsafe.length < MIN_UNSAFE_CASES) {
    problems.push(`only ${unsafe.length} unsafe cases (need >= ${MIN_UNSAFE_CASES}); recall is NOT measured`);
  }
  if (benign.length < MIN_BENIGN_CASES) {
    problems.push(`only ${benign.length} benign cases (need >= ${MIN_BENIGN_CASES}); false-positive rate is NOT measured`);
  }
  if (unsafe.length && recall < MIN_RECALL) {
    problems.push(`recall ${pct(recall)} is below the ${pct(MIN_RECALL)} bar — ${fn} unsafe image(s) called clean`);
  }
  for (const [cat, v] of Object.entries(perCat)) {
    if (v.n === 0) problems.push(`category "${cat}" has no cases — its recall is unmeasured`);
    else if (v.recall < MIN_RECALL) problems.push(`category "${cat}" recall ${pct(v.recall)} below bar`);
  }

  const report = {
    model: avail.model, threshold, counts: { cases: cases.length, unsafe: unsafe.length, benign: benign.length },
    overall: { recall, precision, falseNegatives: fn, falsePositiveRate: fpr, errors },
    perCategory: perCat,
    passed: problems.length === 0,
    problems,
  };
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));

  process.stdout.write('\n── gate ───────────────────────────────\n');
  if (!problems.length) {
    process.stdout.write(`PASS — recall ${pct(recall)} >= ${pct(MIN_RECALL)} in every category.\n`);
    process.stdout.write('This clears the accuracy bar ONLY. Verdicts remain escalate-only:\n');
    process.stdout.write('the model may raise an image for human review, never auto-clear or delete.\n');
    process.exit(0);
  }
  process.stdout.write('FAIL — do not let this model drive automation:\n');
  for (const p of problems) process.stdout.write(`  - ${p}\n`);
  process.stdout.write('\nReminder: a general-purpose VLM is not a CSAM classifier and must not be\n');
  process.stdout.write('relied on as one, whatever this harness reports.\n');
  process.exit(1);
}

main().catch((err) => die(2, `harness error: ${err.stack || err.message}`));
