// Test setup file
require('dotenv').config({ path: '.env.test' });

// Mock logger to reduce noise in tests
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Global test timeout
jest.setTimeout(30000);

// Suppress console output during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global test helpers
global.mockCAToken = 'mock-ca-token-for-testing';
global.mockUserId = '123e4567-e89b-12d3-a456-426614174000';
