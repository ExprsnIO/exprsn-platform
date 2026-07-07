'use strict';

/**
 * Shared config + helpers for the test-data seeder.
 * Used by both the orchestrator (seed-main.js) and the forked workers
 * (cert-worker.js, token-worker.js).
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

// Hard refusal: this seeder writes fake orgs/users/certs/tokens straight into
// the configured DB. Never let it run against a production environment.
if (process.env.NODE_ENV === 'production') {
  console.error('[seed] Refusing to run: NODE_ENV=production. Seed scripts must never run against a production environment.');
  process.exit(1);
}

// Keep DB pools small: forked workers each open their own pool and Postgres
// max_connections is 100. (10 workers * 4) + orchestrator stays well under.
process.env.DB_POOL_MAX = process.env.DB_POOL_MAX || '4';
process.env.DB_POOL_MIN = process.env.DB_POOL_MIN || '1';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
// Quiet the modules' winston loggers during bulk work.
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.CA_LOG_LEVEL = process.env.CA_LOG_LEVEL || 'error';
// @exprsn/shared eagerly constructs a Stripe client at import; give it a dummy
// key so the seeder can require it without real billing config.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_seed_dummy';

const ROOT = path.resolve(__dirname, '..', '..');

// Load repo-root .env for DB/Redis creds. dotenv does NOT override vars already
// set above, so our forced pool caps / dummy keys stick.
require('dotenv').config({ path: path.join(ROOT, '.env') });

function intEnv(name, def) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : def;
}

const config = {
  orgs: intEnv('ORGS', 100),
  usersPerOrg: intEnv('USERS_PER_ORG', 100),
  tokensPerUser: intEnv('TOKENS_PER_USER', 100),
  concurrency: intEnv('CONCURRENCY', Math.max(2, Math.min(10, (os.cpus().length || 4) - 2))),
  entityTypes: ['client', 'server', 'code_signing'],
  emailDomain: 'seed.test',
};

// No default password is shipped. Lazy getter so scripts that never touch
// config.password (reset.js, verify.js) don't need SEED_PASSWORD set, but
// anything that does (seed-main.js) fails fast, before it touches the DB,
// with a clear message.
Object.defineProperty(config, 'password', {
  enumerable: true,
  get() {
    const pw = process.env.SEED_PASSWORD;
    if (!pw) {
      throw new Error(
        "SEED_PASSWORD is required (no default password is shipped). Set it, e.g.: "
        + "SEED_PASSWORD='<choose-a-dev-password>' node scripts/seed/seed-main.js"
      );
    }
    return pw;
  },
});

const SCRATCH = process.env.SEED_SCRATCH || path.join(os.tmpdir(), 'exprsn-seed-work');
const MANIFEST = path.join(SCRATCH, 'manifest.json');

function ensureScratch() {
  fs.mkdirSync(SCRATCH, { recursive: true });
}

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch (_) {
    return { orgs: [], users: [], entityCerts: {}, tokensDone: {} };
  }
}

function saveManifest(m) {
  ensureScratch();
  const tmp = MANIFEST + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(m));
  fs.renameSync(tmp, MANIFEST); // atomic-ish
}

// Per-org identity helpers (deterministic so re-runs are idempotent).
function orgSlug(i) { return `seed-org-${String(i).padStart(3, '0')}`; }
function orgName(i) { return `Seed Org ${String(i).padStart(3, '0')}`; }
function userEmail(orgIdx, userIdx) {
  return `seed-o${String(orgIdx).padStart(3, '0')}-u${String(userIdx).padStart(3, '0')}@${config.emailDomain}`;
}

function orgSettings(i) {
  return {
    allowUserRegistration: i % 2 === 0,
    requireEmailVerification: true,
    requireMfa: i % 5 === 0,
    mfa: {
      allowedMethods: ['totp', 'backup_codes'],
      enrollmentGracePeriodDays: 7,
      rememberDeviceDays: i % 3 === 0 ? 30 : 0,
    },
    sessionTimeout: 3600000,
    passwordPolicy: {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSymbols: i % 2 === 0,
    },
    branding: { primaryColor: '#3366FF', theme: i % 2 ? 'dark' : 'light' },
    features: { groups: true, applications: true, timeline: true },
    seed: true,
  };
}

function userMetadata(orgIdx, userIdx) {
  return {
    seed: true,
    settings: {
      locale: 'en-US',
      timezone: 'America/New_York',
      theme: userIdx % 3 === 0 ? 'dark' : userIdx % 3 === 1 ? 'light' : 'system',
      notifications: {
        email: userIdx % 2 === 0,
        push: userIdx % 3 === 0,
        sms: false,
        digestFrequency: userIdx % 4 === 0 ? 'daily' : 'weekly',
      },
      privacy: { profileVisibility: 'org', showActivity: userIdx % 2 === 0 },
      accessibility: { reducedMotion: false, highContrast: userIdx % 7 === 0 },
    },
  };
}

/**
 * Run `items` through a forked worker phase using `concurrency` child
 * processes. Each child processes a contiguous slice and writes one JSONL
 * line per item ({ i, ok, ... }) to its out file. Returns results aligned to
 * the original item index (or null for items that failed / weren't reached).
 */
function forkPhase(workerScript, phase, items, concurrency, onTick) {
  return new Promise((resolve, reject) => {
    if (!items.length) return resolve([]);
    ensureScratch();
    const planFile = path.join(SCRATCH, `plan-${phase}.json`);
    fs.writeFileSync(planFile, JSON.stringify(items));

    const workers = Math.min(concurrency, items.length);
    const per = Math.ceil(items.length / workers);
    const results = new Array(items.length).fill(null);
    let done = 0;
    let processed = 0;
    let failed = 0;
    const outFiles = [];
    let settled = false;

    const finishOne = () => {
      done++;
      if (done === workers && !settled) {
        settled = true;
        // Merge all out files.
        for (const f of outFiles) {
          let txt = '';
          try { txt = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
          for (const line of txt.split('\n')) {
            if (!line.trim()) continue;
            try {
              const r = JSON.parse(line);
              if (typeof r.i === 'number') results[r.i] = r;
            } catch (_) { /* ignore partial line */ }
          }
        }
        resolve(results);
      }
    };

    for (let w = 0; w < workers; w++) {
      const start = w * per;
      const end = Math.min(start + per, items.length);
      if (start >= end) { done++; continue; }
      const outFile = path.join(SCRATCH, `out-${phase}-${w}.jsonl`);
      outFiles.push(outFile);
      const child = fork(
        path.join(__dirname, workerScript),
        [phase, planFile, String(start), String(end), outFile],
        { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: process.env }
      );
      let errBuf = '';
      if (child.stderr) child.stderr.on('data', (d) => { errBuf += d.toString(); });
      child.on('message', (msg) => {
        if (msg && msg.tick) {
          processed += msg.tick;
          failed += msg.failed || 0;
          if (onTick) onTick(processed, items.length, failed);
        }
      });
      child.on('exit', (code) => {
        if (code !== 0 && !settled) {
          settled = true;
          return reject(new Error(`worker ${workerScript} [${phase}] slice ${start}-${end} exited ${code}\n${errBuf.slice(-2000)}`));
        }
        finishOne();
      });
      child.on('error', (e) => {
        if (!settled) { settled = true; reject(e); }
      });
    }
  });
}

/**
 * Worker-side helper: read this slice's items and the start/end/out from argv,
 * run `handler(item, globalIndex)` for each, write JSONL results, report
 * periodic progress to the parent over IPC, and exit cleanly.
 */
async function runSlice(handler) {
  const [, , , planFile, startS, endS, outFile] = process.argv;
  const start = parseInt(startS, 10);
  const end = parseInt(endS, 10);
  const items = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const out = fs.createWriteStream(outFile, { flags: 'w' });

  let sinceTick = 0;
  let failedSinceTick = 0;
  const flushTick = () => {
    if (sinceTick && process.send) process.send({ tick: sinceTick, failed: failedSinceTick });
    sinceTick = 0;
    failedSinceTick = 0;
  };

  for (let i = start; i < end; i++) {
    const item = items[i];
    try {
      const res = await handler(item, i);
      out.write(JSON.stringify({ i, ok: true, ...res }) + '\n');
    } catch (e) {
      failedSinceTick++;
      out.write(JSON.stringify({ i, ok: false, error: e && e.message ? e.message : String(e) }) + '\n');
    }
    sinceTick++;
    if (sinceTick >= 10) flushTick();
  }
  flushTick();
  await new Promise((res) => out.end(res));
}

module.exports = {
  ROOT, config, SCRATCH, MANIFEST,
  ensureScratch, loadManifest, saveManifest,
  orgSlug, orgName, userEmail, orgSettings, userMetadata,
  forkPhase, runSlice, intEnv,
};
