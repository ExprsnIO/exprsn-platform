/**
 * Jest Test Setup
 * Global configuration for all tests
 */

const path = require('path');

require('dotenv').config({ path: '.env.test' });
// Load platform root .env so the integration suites pick up the real
// Postgres credentials (host/port/user/password). The DB *name* is forced
// below to an isolated test database — never the live `exprsn` DB.
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// Set test environment
process.env.NODE_ENV = 'test';
// @exprsn/shared's index requires stripeService, which constructs a Stripe
// client at require time and throws without a key. Suites that import
// @exprsn/shared (e.g. the socket handler tests) must not depend on a root
// .env being present — supply a dummy test key when none is configured.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.PORT = '3999'; // Test port
process.env.REDIS_ENABLED = 'false'; // Disable Redis for tests

// Point Spark's Sequelize config (which reads SPARK_DB_*, see src/config) at an
// ISOLATED test database, reusing the platform Postgres credentials from .env.
process.env.SPARK_DB_HOST = process.env.SPARK_DB_HOST || process.env.DB_HOST || 'localhost';
process.env.SPARK_DB_PORT = process.env.SPARK_DB_PORT || process.env.DB_PORT || '5432';
process.env.SPARK_DB_USER = process.env.SPARK_DB_USER || process.env.DB_USER || 'exprsn';
process.env.SPARK_DB_PASSWORD = process.env.SPARK_DB_PASSWORD || process.env.DB_PASSWORD || '';
process.env.SPARK_DB_NAME = 'exprsn_spark_test'; // forced — never the live DB

// Increase timeout for integration tests
jest.setTimeout(10000);

// Mock external services
jest.mock('../src/services/notificationService', () => ({
  notifyNewMessage: jest.fn().mockResolvedValue(true),
  notifyMessageEdit: jest.fn().mockResolvedValue(true),
  notifyMessageDelete: jest.fn().mockResolvedValue(true),
  notifyReaction: jest.fn().mockResolvedValue(true)
}));

// @exprsn/shared's idempotencyHandler schedules a require-time setInterval
// (hourly cache cleanup, not unref'd) that keeps Jest alive forever after any
// suite imports @exprsn/shared (e.g. the socket handler tests). Spark never
// uses the idempotency middleware — stub the module out entirely.
jest.mock('@exprsn/shared/middleware/idempotencyHandler', () => ({}));

// FEAT-070: spark suites must NEVER load timeline's real relationship façade
// (it attaches timeline's Sequelize/models). Default is allow-all so existing
// suites are unaffected; enforcement suites override this mock per-file with
// jest.fn implementations. Plain async functions on purpose — resetMocks:true
// would strip jest.fn implementations between tests.
jest.mock('../../timeline/src/services/relationshipService', () => ({
  getSuppressedIds: async () => [],
  getBlockedIds: async () => [],
  getBlockedByIds: async () => [],
  isBlockedEitherWay: async () => false,
  canContact: async () => true
}));

// Mock Elasticsearch for search tests
jest.mock('@elastic/elasticsearch', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      index: jest.fn().mockResolvedValue({ result: 'created' }),
      search: jest.fn().mockResolvedValue({
        hits: {
          hits: [],
          total: { value: 0 }
        }
      }),
      delete: jest.fn().mockResolvedValue({ result: 'deleted' }),
      ping: jest.fn().mockResolvedValue(true)
    }))
  };
});

// Mock Bull queue for background jobs
jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    process: jest.fn(),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(true)
  }));
});

// Global test utilities
global.delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Setup console suppressio for cleaner test output
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress expected error logs during tests
  console.error = jest.fn((message) => {
    if (
      typeof message === 'string' &&
      (message.includes('ValidationError') ||
       message.includes('Not found') ||
       message.includes('Access denied'))
    ) {
      return;
    }
    originalConsoleError(message);
  });

  console.warn = jest.fn((message) => {
    if (typeof message === 'string' && message.includes('deprecat')) {
      return;
    }
    originalConsoleWarn(message);
  });
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Export for use in tests
module.exports = {
  delay: global.delay
};
