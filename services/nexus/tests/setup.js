// Test setup and global configuration
const path = require('path');

// Load DB credentials from the repo-root .env (dev convenience — no secrets are
// committed here), then FORCE the database name to the isolated test DB so tests
// never touch the real `exprsn` database.
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'exprsn_nexus_test';
process.env.PG_DATABASE = 'exprsn_nexus_test';
process.env.SERVICE_PORT = '3099';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests

// Mock Redis to avoid requiring Redis server
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    return {
      options: {},
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn()
    };
  });
});

// Mock Bull so require-time queue construction (e.g. eventReminderService's
// `new Queue(...)`, `.process()`, `.on()`) doesn't try to reach Redis during
// unit tests. Returns a no-op queue exposing the methods nexus uses.
jest.mock('bull', () => {
  return jest.fn().mockImplementation((name) => ({
    name,
    add: jest.fn().mockResolvedValue({ id: 'test-job' }),
    getJobs: jest.fn().mockResolvedValue([]),
    getJob: jest.fn().mockResolvedValue(null),
    process: jest.fn(),
    on: jest.fn(),
    removeJobs: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
  }));
});

// Global test timeout
jest.setTimeout(10000);
