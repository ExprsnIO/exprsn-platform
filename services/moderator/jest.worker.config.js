/**
 * Jest config for the FEAT-009 UGC moderation worker (terminal-state ladder).
 *
 * Deliberately does NOT load tests/integration/setup.js: the ladder is pure,
 * dependency-injected logic, so these run with NO Postgres/Redis. Run with:
 *   npx jest --config jest.worker.config.js
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/worker/**/*.test.js'],
  modulePaths: ['<rootDir>'],
  clearMocks: true,
  verbose: true,
  testTimeout: 10000,
};
