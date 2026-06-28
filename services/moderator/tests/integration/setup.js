/**
 * ═══════════════════════════════════════════════════════════
 * Integration Test Setup
 * Database and service setup/teardown
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// ───────────────────────────────────────────────────────────
// Force the test environment + real DB credentials BEFORE any
// model/config module is required. config/database.js reads the
// DB_* vars (the local moderator .env only defines MODERATOR_PG_*,
// so without this the connection falls back to postgres/postgres).
// Credentials are pulled from the repo-root .env and the suites are
// pinned to an ISOLATED database (never the real `exprsn`).
// ───────────────────────────────────────────────────────────
process.env.NODE_ENV = 'test';

const rootEnvPath = path.resolve(__dirname, '../../../../.env');
const rootEnv = fs.existsSync(rootEnvPath)
  ? dotenv.parse(fs.readFileSync(rootEnvPath))
  : {};

process.env.DB_HOST = process.env.DB_HOST || rootEnv.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || rootEnv.DB_PORT || '5432';
process.env.DB_USER = process.env.DB_USER || rootEnv.DB_USER || 'exprsn';
process.env.DB_PASSWORD =
  process.env.DB_PASSWORD || rootEnv.DB_PASSWORD || 'exprsn';
process.env.DB_NAME_TEST =
  process.env.DB_NAME_TEST || 'exprsn_moderator_test';

const logger = require('../../utils/logger');
// The Sequelize models (rules/queue/appeals) live in the `moderator`
// schema; the raw-pg models (services/moderationService) live in `public`.
const { sequelize } = require('../../models/sequelize-index');
const { pool } = require('../../models');

// Raw-pg layer DDL (moderation_items, reports, review_queue, ... in `public`).
const pgSchemaSql = fs.readFileSync(
  path.resolve(__dirname, '../../database/schema.sql'),
  'utf8'
);

// Tables created by database/schema.sql in the `public` schema.
const PG_TABLES = [
  'appeals',
  'user_actions',
  'moderation_actions',
  'review_queue',
  'reports',
  'moderation_rules',
  'moderation_items',
  'moderator_performance',
  'ai_provider_config'
];

/**
 * Setup test database
 */
beforeAll(async () => {
  try {
    await sequelize.authenticate();

    // Rebuild the raw-pg layer (public schema) from schema.sql. Recreating
    // the schema makes CREATE TYPE/TABLE idempotent across the four suites.
    await sequelize.query('DROP SCHEMA IF EXISTS public CASCADE;');
    await sequelize.query('CREATE SCHEMA public;');
    await sequelize.query(pgSchemaSql);

    // Rebuild the Sequelize layer (moderator schema), then sync the models.
    // Sync in explicit dependency order: under a custom `define.schema` the
    // column-level `references` strings aren't linked to their models, so
    // sequelize.sync() can't topologically order FK creation on its own.
    await sequelize.query('DROP SCHEMA IF EXISTS moderator CASCADE;');
    await sequelize.query('CREATE SCHEMA moderator;');

    const SYNC_ORDER = [
      'ModerationCase', // moderation_items (no deps)
      'Report', // reports (no deps)
      'ModerationRule',
      'UserAction', // -> reports
      'ReviewQueue', // -> moderation_items
      'ModerationAction', // -> moderation_items, reports
      'Appeal' // -> moderation_items, user_actions
    ];
    const ordered = [
      ...SYNC_ORDER,
      ...Object.keys(sequelize.models).filter((m) => !SYNC_ORDER.includes(m))
    ];
    for (const modelName of ordered) {
      await sequelize.models[modelName].sync({ force: true });
    }

    logger.info('Test database synced');
  } catch (error) {
    logger.error('Unable to connect to test database', {
      error: error.message
    });
    throw error;
  }
});

/**
 * Clean up after each test
 */
afterEach(async () => {
  try {
    // Clear the Sequelize-managed tables (moderator schema).
    const models = Object.keys(sequelize.models);
    for (const modelName of models) {
      await sequelize.models[modelName].destroy({
        where: {},
        truncate: true,
        cascade: true,
        restartIdentity: true
      });
    }

    // Clear the raw-pg tables (public schema).
    await sequelize.query(
      `TRUNCATE ${PG_TABLES.join(', ')} RESTART IDENTITY CASCADE;`
    );
  } catch (error) {
    logger.error('Error cleaning up test data', {
      error: error.message
    });
  }
});

/**
 * Teardown test database
 */
afterAll(async () => {
  try {
    await sequelize.close();
    if (pool && typeof pool.end === 'function') {
      await pool.end();
    }
    logger.info('Test database connection closed');
  } catch (error) {
    logger.error('Error closing test database', {
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Test Data Fixtures
// ═══════════════════════════════════════════════════════════

// User/moderator/reporter ids are UUID columns in the models, so fixtures and
// suites must use real UUIDs. These canonical ids match the literals the test
// suites assert against (e.g. the user-456 -> ...000000456 mapping).
const IDS = {
  USER_456: 'aaaaaaaa-0000-4000-8000-000000000456',
  MODERATOR_789: 'cccccccc-0000-4000-8000-000000000789',
  REPORTER_999: 'dddddddd-0000-4000-8000-000000000999'
};

/**
 * Create test moderation case
 */
const createTestModerationCase = async () => {
  const { ModerationCase } = require('../../models/sequelize-index');

  return await ModerationCase.create({
    contentType: 'post',
    // Unique per call — (source_service, content_type, content_id) is a unique key.
    contentId: `test-content-${require('crypto').randomUUID()}`,
    sourceService: 'timeline.exprsn.io',
    userId: IDS.USER_456,
    contentText: 'This is test content',
    riskScore: 50,
    riskLevel: 'medium',
    status: 'pending',
    submittedAt: Date.now()
  });
};

/**
 * Create test user action
 */
const createTestUserAction = async () => {
  const { UserAction } = require('../../models/sequelize-index');

  return await UserAction.create({
    userId: IDS.USER_456,
    actionType: 'warn',
    reason: 'Test warning',
    durationSeconds: null,
    expiresAt: null,
    performedBy: IDS.MODERATOR_789,
    active: true,
    performedAt: Date.now()
  });
};

/**
 * Create test appeal
 */
const createTestAppeal = async (moderationItemId = null, userActionId = null) => {
  const { Appeal } = require('../../models/sequelize-index');

  return await Appeal.create({
    moderationItemId,
    userActionId,
    userId: IDS.USER_456,
    reason: 'I believe this was a mistake',
    additionalInfo: 'Additional context',
    status: 'pending',
    submittedAt: Date.now()
  });
};

/**
 * Create test report
 */
const createTestReport = async () => {
  const { Report } = require('../../models/sequelize-index');

  return await Report.create({
    contentType: 'post',
    contentId: 'test-content-123',
    sourceService: 'timeline.exprsn.io',
    reportedBy: IDS.REPORTER_999,
    reason: 'spam',
    details: 'This is spam content',
    status: 'pending'
  });
};

/**
 * Create test review queue item
 */
const createTestQueueItem = async (moderationItemId) => {
  const { ReviewQueue } = require('../../models/sequelize-index');

  return await ReviewQueue.create({
    moderationItemId,
    priority: 50,
    escalated: false,
    status: 'pending',
    queuedAt: Date.now()
  });
};

// ═══════════════════════════════════════════════════════════
// Mock Services
// ═══════════════════════════════════════════════════════════

/**
 * Mock CA token validation
 */
const mockCATokenValidation = () => {
  jest.mock('../../utils/tokenValidation', () => ({
    validateCAToken: jest.fn().mockResolvedValue({
      valid: true,
      userId: 'test-user-456',
      permissions: { read: true, write: true }
    })
  }));
};

/**
 * Mock Herald client
 */
const mockHeraldClient = () => {
  jest.mock('../../services/heraldClient', () => ({
    notifyUser: jest.fn().mockResolvedValue({ success: true }),
    notifyModerators: jest.fn().mockResolvedValue({ success: true }),
    notifyService: jest.fn().mockResolvedValue({ success: true }),
    notifyBatch: jest.fn().mockResolvedValue({ success: true }),
    notifyContentDecision: jest.fn().mockResolvedValue({ success: true }),
    notifyUserAction: jest.fn().mockResolvedValue({ success: true }),
    notifyAppealDecision: jest.fn().mockResolvedValue({ success: true }),
    notifyNewAppeal: jest.fn().mockResolvedValue({ success: true }),
    notifyHighPriorityContent: jest.fn().mockResolvedValue({ success: true }),
    notifyEscalation: jest.fn().mockResolvedValue({ success: true })
  }));
};

// ═══════════════════════════════════════════════════════════
// Export Helpers
// ═══════════════════════════════════════════════════════════

module.exports = {
  sequelize,
  createTestModerationCase,
  createTestUserAction,
  createTestAppeal,
  createTestReport,
  createTestQueueItem,
  mockCATokenValidation,
  mockHeraldClient
};
