/**
 * ═══════════════════════════════════════════════════════════
 * Jest Configuration for exprsn-svr
 * Comprehensive testing setup for all routes and services
 * ═══════════════════════════════════════════════════════════
 */

module.exports = {
  testEnvironment: 'node',

  // Handle ES modules from JSDOM and other dependencies
  transformIgnorePatterns: [
    'node_modules/(?!(jsdom|@exodus/bytes|whatwg-url|data-urls|html-encoding-sniffer|abab|saxes|w3c-xmlserializer|isomorphic-dompurify)/)'
  ],

  // Coverage settings
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],

  // Coverage thresholds (note: singular 'coverageThreshold')
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },

  // Files to collect coverage from
  collectCoverageFrom: [
    'routes/**/*.js',
    'lowcode/routes/**/*.js',
    'lowcode/services/**/*.js',
    'workflow/routes/**/*.js',
    'routes/forge/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**',
    '!**/public/**',
    '!**/migrations/**',
    '!**/seeders/**'
  ],

  // Test match patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
    '**/__tests__/**/*.js'
  ],

  // Test path ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/'
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Verbose output
  verbose: true,

  // Test timeout (30 seconds for integration tests)
  testTimeout: 30000,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Module name mapper for path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@lowcode/(.*)$': '<rootDir>/lowcode/$1',
    '^@workflow/(.*)$': '<rootDir>/workflow/$1',
    '^@forge/(.*)$': '<rootDir>/routes/forge/$1',
    '^@shared/(.*)$': '<rootDir>/../shared/$1',
    // Mock problematic ES modules
    'isomorphic-dompurify': '<rootDir>/tests/__mocks__/isomorphic-dompurify.js',
    'jsdom': '<rootDir>/tests/__mocks__/jsdom.js'
  }
};
