/**
 * ═══════════════════════════════════════════════════════════
 * Integration Test Setup
 * Database and service setup/teardown
 * ═══════════════════════════════════════════════════════════
 */

const { Sequelize } = require('sequelize');
const logger = require('../../utils/logger');

// Test database configuration
const testDbConfig = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: process.env.TEST_DB_PORT || 5432,
  database: process.env.TEST_DB_NAME || 'exprsn_moderator_test',
  username: process.env.TEST_DB_USER || 'moderator_service',
  password: process.env.TEST_DB_PASSWORD || 'test_password',
  dialect: 'postgres',
  logging: false
};

let sequelize;

/**
 * Setup test database
 */
beforeAll(async () => {
  // Create Sequelize instance
  sequelize = new Sequelize(testDbConfig);

  try {
    // Test connection
    await sequelize.authenticate();
    logger.info('Test database connection established');

    // Sync database (create tables)
    await sequelize.sync({ force: true });
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
  if (sequelize) {
    try {
      // Clear all tables
      const models = Object.keys(sequelize.models);
      for (const modelName of models) {
        await sequelize.models[modelName].destroy({
          where: {},
          truncate: true,
          cascade: true
        });
      }
    } catch (error) {
      logger.error('Error cleaning up test data', {
        error: error.message
      });
    }
  }
});

/**
 * Teardown test database
 */
afterAll(async () => {
  if (sequelize) {
    try {
      await sequelize.close();
      logger.info('Test database connection closed');
    } catch (error) {
      logger.error('Error closing test database', {
        error: error.message
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════
// Test Data Fixtures
// ═══════════════════════════════════════════════════════════

/**
 * Create test moderation case
 */
const createTestModerationCase = async () => {
  const { ModerationCase } = require('../../models/sequelize-index');

  return await ModerationCase.create({
    contentType: 'post',
    contentId: 'test-content-123',
    sourceService: 'timeline.exprsn.io',
    userId: 'test-user-456',
    content: {
      text: 'This is test content'
    },
    riskScore: 50,
    decision: 'pending',
    status: 'pending',
    automated: false
  });
};

/**
 * Create test user action
 */
const createTestUserAction = async () => {
  const { UserAction } = require('../../models/sequelize-index');

  return await UserAction.create({
    userId: 'test-user-456',
    actionType: 'warn',
    reason: 'Test warning',
    durationSeconds: null,
    expiresAt: null,
    performedBy: 'test-moderator-789',
    active: true
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
    userId: 'test-user-456',
    reason: 'I believe this was a mistake',
    additionalInfo: 'Additional context',
    status: 'pending'
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
    reportedUserId: 'test-user-456',
    reporterUserId: 'test-reporter-999',
    reason: 'spam',
    description: 'This is spam content',
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
    status: 'pending'
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
