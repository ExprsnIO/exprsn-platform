/**
 * Jest Configuration for Exprsn Moderator Service
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
    'services/**/*.js',
    'routes/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**'
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80
    }
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.js'],

  // The UGC worker ladder tests (FEAT-009) are pure-logic unit tests with all
  // deps injected; they must NOT load the DB-bound integration setup above.
  // They run under jest.worker.config.js instead — excluded here so `npx jest`
  // doesn't drag them through a live-Postgres beforeAll.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/worker/'],

  // Test timeout
  testTimeout: 20000,

  // All integration suites share one test database, so they must run
  // serially (force-sync in beforeAll would otherwise race across workers).
  maxWorkers: 1,

  // Clear mocks between tests
  clearMocks: true,

  // Verbose output
  verbose: true,

  // Coverage reporters
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov'
  ],

  // Module paths
  modulePaths: ['<rootDir>'],

  // Transform ignore patterns
  transformIgnorePatterns: [
    'node_modules/(?!(supertest)/)'
  ]
};
