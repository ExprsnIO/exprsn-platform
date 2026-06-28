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
