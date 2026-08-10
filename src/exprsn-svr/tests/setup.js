/**
 * ═══════════════════════════════════════════════════════════
 * Test Setup and Configuration
 * Global setup for all test suites
 * ═══════════════════════════════════════════════════════════
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOW_CODE_DEV_AUTH = 'true'; // Bypass auth in tests

// Suppress console output during tests (optional)
if (process.env.SILENT_TESTS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}

// Global test utilities
global.testHelpers = {
  /**
   * Create a mock request object
   */
  mockRequest: (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    ...overrides
  }),

  /**
   * Create a mock response object
   */
  mockResponse: () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.render = jest.fn().mockReturnValue(res);
    res.redirect = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    return res;
  },

  /**
   * Wait for a specified time
   */
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Generate random string
   */
  randomString: (length = 8) => {
    return Math.random().toString(36).substring(2, length + 2);
  },

  /**
   * Generate random email
   */
  randomEmail: () => {
    return `test${Math.random().toString(36).substring(7)}@example.com`;
  }
};

// Global test configuration
global.testConfig = {
  apiTimeout: 5000,
  dbTimeout: 10000,
  maxRetries: 3
};

// Jest custom matchers
expect.extend({
  /**
   * Check if response has standard success format
   */
  toBeSuccessResponse(received) {
    const pass =
      received &&
      typeof received === 'object' &&
      received.success === true &&
      received.hasOwnProperty('data');

    return {
      message: () =>
        pass
          ? `expected ${JSON.stringify(received)} not to be a success response`
          : `expected ${JSON.stringify(received)} to be a success response with { success: true, data: ... }`,
      pass
    };
  },

  /**
   * Check if response has standard error format
   */
  toBeErrorResponse(received) {
    const pass =
      received &&
      typeof received === 'object' &&
      received.success === false &&
      received.hasOwnProperty('error') &&
      received.hasOwnProperty('message');

    return {
      message: () =>
        pass
          ? `expected ${JSON.stringify(received)} not to be an error response`
          : `expected ${JSON.stringify(received)} to be an error response with { success: false, error: ..., message: ... }`,
      pass
    };
  },

  /**
   * Check if array contains object with properties
   */
  toContainObjectWith(received, expected) {
    const pass = Array.isArray(received) && received.some(item => {
      return Object.keys(expected).every(key => item[key] === expected[key]);
    });

    return {
      message: () =>
        pass
          ? `expected array not to contain object with ${JSON.stringify(expected)}`
          : `expected array to contain object with ${JSON.stringify(expected)}`,
      pass
    };
  }
});

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in test:', reason);
  // Don't exit the process, let Jest handle it
});

module.exports = global.testHelpers;
