/**
 * Jest Test Setup
 * Global configuration for all tests
 */

require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3999'; // Test port
process.env.DB_NAME = 'exprsn_spark_test';
process.env.REDIS_ENABLED = 'false'; // Disable Redis for tests

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
