/**
 * Provisioning suite setup (setupFilesAfterEnv — runs before each test file loads).
 *
 * 1. Force env: an ISOLATED test DB (exprsn_provisioning_test — NEVER the real
 *    `exprsn`), Redis off, dummy Stripe key (@exprsn/shared builds Stripe at
 *    require time). Set BEFORE any auth src module is required so config reads them.
 * 2. Mock the four CA façades the engine + member hook require lazily
 *    (certificate / token / directory / platformSigning) with stateful in-memory
 *    fakes — no real RSA keygen, no CA DB — while auth's Sequelize writes stay REAL.
 * 3. Reset fake CA state + restore spies between tests.
 */

'use strict';

const path = require('path');

// Load root .env for the shared DB creds, then override the DB NAME to the
// dedicated provisioning test DB. dotenv does not override already-set vars.
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

process.env.NODE_ENV = 'test';
process.env.AUTH_DB_HOST = process.env.AUTH_DB_HOST || process.env.DB_HOST || 'localhost';
process.env.AUTH_DB_PORT = process.env.AUTH_DB_PORT || process.env.DB_PORT || '5432';
process.env.AUTH_DB_USER = process.env.AUTH_DB_USER || process.env.DB_USER;
process.env.AUTH_DB_PASSWORD = process.env.AUTH_DB_PASSWORD || process.env.DB_PASSWORD;
// HARD override — the auth suite defaults AUTH_DB_NAME from .env (which points at
// the real `exprsn`); force isolation regardless of what .env set.
process.env.AUTH_DB_NAME = 'exprsn_provisioning_test';
process.env.DB_LOGGING = 'false';
process.env.REDIS_ENABLED = 'false';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

// Fail-safe: never let this suite run against the real database.
if (process.env.AUTH_DB_NAME === 'exprsn') {
  throw new Error('Refusing to run provisioning tests against the real `exprsn` DB');
}

// ── Mock the CA crypto/directory primitives (lazy-required by engine + hook) ────
jest.mock('../../../services/ca/services/certificate', () => require('./fakes/fakeCertificate'));
jest.mock('../../../services/ca/services/token', () => require('./fakes/fakeToken'));
jest.mock('../../../services/ca/services/directory', () => require('./fakes/fakeDirectory'));
jest.mock('../../../services/ca/services/platformSigning', () => require('./fakes/fakePlatformSigning'));

// ── Mock the slice-2 nexus/spark façades (lazy-required by engine S7/S8) ────────
// enterprise/team templates set nexus.create=true, so a real S7 would reach the
// nexus module's own schema (not synced here) and the spark module's Redis/ES at
// require time. Mock them with observable in-memory fakes.
jest.mock('../../../services/nexus/src/services/groupService', () => require('./fakes/fakeNexusGroup'));
jest.mock('../../../services/spark/src/services/groupChannelService', () => require('./fakes/fakeSparkChannels'));

const caState = require('./fakes/caState');

beforeEach(() => {
  caState.reset();
});

afterEach(() => {
  // Undo any per-test jest.spyOn failure injections.
  jest.restoreAllMocks();
});

jest.setTimeout(30000);
