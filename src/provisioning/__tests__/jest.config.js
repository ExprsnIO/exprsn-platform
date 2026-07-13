/**
 * Jest config for the FEAT-032 org-provisioning saga suite.
 *
 * Run from repo root:
 *   npx jest --config src/provisioning/__tests__/jest.config.js
 *
 * Requires the isolated test DB `exprsn_provisioning_test` (see setup.js). One-time
 * create (Postgres must be up):
 *   docker exec -e PGPASSWORD=<pw> exprsn-postgres \
 *     psql -U exprsn -d exprsn -c "CREATE DATABASE exprsn_provisioning_test OWNER exprsn;"
 */

'use strict';

module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/setup.js'],
  testTimeout: 30000,
  // All DB-touching suites share one test DB and reset the `auth` schema in
  // beforeAll; run serially so parallel workers never clobber each other.
  maxWorkers: 1,
  // Fakes are stateful singletons reset in setup.js's beforeEach; do NOT let jest
  // wipe their methods. Spies are restored explicitly in setup.js's afterEach.
  clearMocks: false,
  resetMocks: false,
  restoreMocks: false,
  forceExit: true,
  verbose: true
};
