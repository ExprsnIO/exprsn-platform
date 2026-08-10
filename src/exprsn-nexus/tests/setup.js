// Test setup and global configuration
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'exprsn_nexus_test';
process.env.SERVICE_PORT = '3099';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests

// Mock Redis to avoid requiring Redis server
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    return {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn()
    };
  });
});

// Global test timeout
jest.setTimeout(10000);
