/**
 * Jest Configuration
 * Exprsn Spark Test Suite
 */

module.exports = {
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js'
  ],

  // Coverage collection
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/cluster.js',
    '!**/node_modules/**',
    '!**/tests/**'
  ],

  // Coverage thresholds (aim for 80%+)
  coverageThresholds: {
    global: {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80
    }
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Test timeout (10 seconds)
  testTimeout: 10000,

  // The integration suites (encryption/message/etc.) share a single Postgres
  // test database and force-sync/clean it in before hooks. Run suites serially
  // so parallel workers don't drop/truncate each other's tables mid-test
  // (same approach as the auth module's jest config).
  maxWorkers: 1,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Coverage output
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // Module paths
  moduleDirectories: ['node_modules', 'src'],

  // Transform (if using TypeScript in future)
  transform: {},

  // Test environment options
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  }
};
