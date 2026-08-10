/**
 * ═══════════════════════════════════════════════════════════
 * Test Setup
 * Global test configuration and helpers
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.REDIS_ENABLED = 'false';
process.env.ELASTICSEARCH_ENABLED = 'false';
process.env.HERALD_ENABLED = 'false';
process.env.ENABLE_JOBS = 'false';

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Mock logger to reduce test output
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Global test utilities
global.testUtils = {
  /**
   * Wait for a condition to be true
   */
  async waitFor(condition, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Timeout waiting for condition');
  },

  /**
   * Generate random string
   */
  randomString(length = 10) {
    return Math.random().toString(36).substring(2, length + 2);
  },

  /**
   * Generate random email
   */
  randomEmail() {
    return `test-${this.randomString()}@example.com`;
  }
};

// Clean up after all tests
afterAll(async () => {
  // Close database connections
  const db = require('../src/models');
  if (db.sequelize) {
    await db.sequelize.close();
  }
});
