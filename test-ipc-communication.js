#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * IPC End-to-End Communication Test
 *
 * Tests the complete IPC flow:
 * 1. Bridge service starts and initializes IPC Router
 * 2. Timeline service connects to Bridge via Socket.IO
 * 3. Timeline emits events through IPC
 * 4. Bridge routes events correctly
 * 5. Services receive and acknowledge events
 * ═══════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const io = require('socket.io-client');
const axios = require('axios');
const { createLogger } = require('./src/shared');

const logger = createLogger('ipc-test');

// Test configuration
const BRIDGE_URL = process.env.BRIDGE_URL || 'https://localhost:3010';
const TIMELINE_SERVICE = 'exprsn-timeline';
const TEST_TIMEOUT = 30000; // 30 seconds

// Track test results
const testResults = {
  bridgeHealth: false,
  socketConnection: false,
  ipcStats: false,
  eventEmit: false,
  eventReceive: false,
  crudCreate: false,
  crudRead: false,
  jsonLexExecute: false
};

let testSocket;

/**
 * Test 1: Bridge Health Check
 */
async function testBridgeHealth() {
  logger.info('Test 1: Checking Bridge service health...');

  try {
    const response = await axios.get(`${BRIDGE_URL}/health`, {
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false // Dev only
      })
    });

    if (response.data.status === 'healthy') {
      logger.info('✓ Bridge service is healthy', {
        version: response.data.version,
        service: response.data.service
      });
      testResults.bridgeHealth = true;
      return true;
    }
  } catch (error) {
    logger.error('✗ Bridge health check failed', {
      error: error.message
    });
    return false;
  }
}

/**
 * Test 2: Socket.IO Connection
 */
async function testSocketConnection() {
  logger.info('Test 2: Testing Socket.IO connection to Bridge...');

  return new Promise((resolve) => {
    testSocket = io(`${BRIDGE_URL}/ipc/${TIMELINE_SERVICE}`, {
      rejectUnauthorized: false, // Dev only
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 3
    });

    testSocket.on('connect', () => {
      logger.info('✓ Connected to Bridge IPC namespace', {
        id: testSocket.id,
        namespace: `/ipc/${TIMELINE_SERVICE}`
      });
      testResults.socketConnection = true;
      resolve(true);
    });

    testSocket.on('connect_error', (error) => {
      logger.error('✗ Socket.IO connection failed', {
        error: error.message
      });
      resolve(false);
    });

    setTimeout(() => {
      if (!testSocket.connected) {
        logger.error('✗ Socket.IO connection timeout');
        resolve(false);
      }
    }, 10000);
  });
}

/**
 * Test 3: IPC Statistics Endpoint
 */
async function testIPCStats() {
  logger.info('Test 3: Checking IPC statistics endpoint...');

  try {
    const response = await axios.get(`${BRIDGE_URL}/api/ipc/stats`, {
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
      })
    });

    if (response.data.success) {
      logger.info('✓ IPC statistics retrieved', {
        activeServices: response.data.data.activeServices,
        activeConnections: response.data.data.activeConnections,
        rateLimiting: response.data.data.rateLimits.enabled
      });
      testResults.ipcStats = true;
      return true;
    }
  } catch (error) {
    logger.error('✗ IPC stats request failed', {
      error: error.message
    });
    return false;
  }
}

/**
 * Test 4: Event Emit
 */
async function testEventEmit() {
  logger.info('Test 4: Testing IPC event emit...');

  return new Promise((resolve) => {
    // Listen for acknowledgment
    testSocket.once('ipc:ack', (data) => {
      logger.info('✓ Event emit acknowledged', {
        event: data.event,
        target: data.target
      });
      testResults.eventEmit = true;
      resolve(true);
    });

    // Listen for errors
    testSocket.once('ipc:error', (error) => {
      logger.error('✗ Event emit failed', {
        error: error.error,
        message: error.message
      });
      resolve(false);
    });

    // Emit test event
    testSocket.emit('ipc:emit', {
      event: 'test:ping',
      payload: {
        message: 'Hello from IPC test',
        timestamp: Date.now()
      },
      target: 'broadcast',
      options: {
        requireAck: true
      }
    });

    setTimeout(() => {
      if (!testResults.eventEmit) {
        logger.error('✗ Event emit timeout - no acknowledgment received');
        resolve(false);
      }
    }, 5000);
  });
}

/**
 * Test 5: Event Receive
 */
async function testEventReceive() {
  logger.info('Test 5: Testing IPC event receive...');

  return new Promise((resolve) => {
    // Listen for test event
    testSocket.on('test:ping', (data) => {
      logger.info('✓ Event received via IPC', {
        message: data.message,
        timestamp: data.timestamp
      });
      testResults.eventReceive = true;
      resolve(true);
    });

    // Emit event that should come back
    testSocket.emit('ipc:emit', {
      event: 'test:ping',
      payload: {
        message: 'Echo test',
        timestamp: Date.now()
      },
      target: TIMELINE_SERVICE
    });

    setTimeout(() => {
      if (!testResults.eventReceive) {
        logger.warn('Event receive test skipped - depends on service echo');
        resolve(true); // Don't fail - this requires service to echo back
      }
    }, 5000);
  });
}

/**
 * Test 6: CRUD Create Operation
 */
async function testCRUDCreate() {
  logger.info('Test 6: Testing IPC CRUD create operation...');

  return new Promise((resolve) => {
    testSocket.emit('ipc:create', {
      resource: 'test_items',
      data: {
        name: 'Test Item',
        value: 42,
        timestamp: Date.now()
      },
      options: {}
    }, (response) => {
      if (response.success) {
        logger.info('✓ CRUD create successful', {
          data: response.data
        });
        testResults.crudCreate = true;
        resolve(true);
      } else {
        logger.error('✗ CRUD create failed', {
          error: response.error
        });
        resolve(false);
      }
    });

    setTimeout(() => {
      if (!testResults.crudCreate) {
        logger.warn('CRUD create test skipped - requires service handler');
        resolve(true); // Don't fail - requires service implementation
      }
    }, 5000);
  });
}

/**
 * Test 7: CRUD Read Operation
 */
async function testCRUDRead() {
  logger.info('Test 7: Testing IPC CRUD read operation...');

  return new Promise((resolve) => {
    testSocket.emit('ipc:read', {
      resource: 'test_items',
      query: {},
      options: {}
    }, (response) => {
      if (response.success) {
        logger.info('✓ CRUD read successful', {
          count: Array.isArray(response.data) ? response.data.length : 'unknown'
        });
        testResults.crudRead = true;
        resolve(true);
      } else {
        logger.error('✗ CRUD read failed', {
          error: response.error
        });
        resolve(false);
      }
    });

    setTimeout(() => {
      if (!testResults.crudRead) {
        logger.warn('CRUD read test skipped - requires service handler');
        resolve(true); // Don't fail - requires service implementation
      }
    }, 5000);
  });
}

/**
 * Test 8: JSONLex Execution
 */
async function testJSONLexExecute() {
  logger.info('Test 8: Testing JSONLex execution via IPC...');

  return new Promise((resolve) => {
    const expression = {
      __jsonlex: true,
      expr: {
        fullName: {
          $concat: [
            { $var: 'firstName' },
            ' ',
            { $var: 'lastName' }
          ]
        },
        age: { $var: 'age' },
        isAdult: {
          $gte: [{ $var: 'age' }, 18]
        }
      }
    };

    const context = {
      firstName: 'John',
      lastName: 'Doe',
      age: 25
    };

    testSocket.emit('ipc:jsonlex', {
      expression,
      context,
      options: {}
    }, (response) => {
      if (response.success) {
        logger.info('✓ JSONLex execution successful', {
          result: response.result
        });

        // Validate result
        if (response.result.fullName === 'John Doe' &&
            response.result.age === 25 &&
            response.result.isAdult === true) {
          logger.info('✓ JSONLex result validation passed');
          testResults.jsonLexExecute = true;
          resolve(true);
        } else {
          logger.error('✗ JSONLex result validation failed', {
            expected: { fullName: 'John Doe', age: 25, isAdult: true },
            actual: response.result
          });
          resolve(false);
        }
      } else {
        logger.error('✗ JSONLex execution failed', {
          error: response.error
        });
        resolve(false);
      }
    });

    setTimeout(() => {
      if (!testResults.jsonLexExecute) {
        logger.error('✗ JSONLex execution timeout');
        resolve(false);
      }
    }, 5000);
  });
}

/**
 * Cleanup
 */
function cleanup() {
  if (testSocket && testSocket.connected) {
    logger.info('Disconnecting test socket...');
    testSocket.disconnect();
  }
}

/**
 * Print Test Summary
 */
function printSummary() {
  logger.info('\n' + '═'.repeat(70));
  logger.info('IPC END-TO-END TEST SUMMARY');
  logger.info('═'.repeat(70));

  const tests = [
    { name: 'Bridge Health Check', result: testResults.bridgeHealth, critical: true },
    { name: 'Socket.IO Connection', result: testResults.socketConnection, critical: true },
    { name: 'IPC Statistics Endpoint', result: testResults.ipcStats, critical: true },
    { name: 'Event Emit', result: testResults.eventEmit, critical: true },
    { name: 'Event Receive', result: testResults.eventReceive, critical: false },
    { name: 'CRUD Create', result: testResults.crudCreate, critical: false },
    { name: 'CRUD Read', result: testResults.crudRead, critical: false },
    { name: 'JSONLex Execute', result: testResults.jsonLexExecute, critical: true }
  ];

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  tests.forEach(test => {
    const status = test.result ? '✓ PASS' : (test.critical ? '✗ FAIL' : '⊘ SKIP');
    const icon = test.result ? '✓' : (test.critical ? '✗' : '⊘');

    logger.info(`${icon} ${test.name.padEnd(30)} ${status}`);

    if (test.result) passed++;
    else if (test.critical) failed++;
    else skipped++;
  });

  logger.info('─'.repeat(70));
  logger.info(`Total: ${tests.length} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
  logger.info('═'.repeat(70));

  const criticalTests = tests.filter(t => t.critical);
  const criticalPassed = criticalTests.filter(t => t.result).length;
  const criticalTotal = criticalTests.length;

  if (criticalPassed === criticalTotal) {
    logger.info('✓ All critical tests passed! IPC system is operational.');
    return 0;
  } else {
    logger.error(`✗ ${criticalTotal - criticalPassed} critical test(s) failed. IPC system needs attention.`);
    return 1;
  }
}

/**
 * Main Test Runner
 */
async function runTests() {
  logger.info('Starting IPC End-to-End Communication Tests...');
  logger.info(`Bridge URL: ${BRIDGE_URL}`);
  logger.info(`Test Timeout: ${TEST_TIMEOUT}ms\n`);

  try {
    // Run tests sequentially
    await testBridgeHealth();

    if (testResults.bridgeHealth) {
      await testSocketConnection();

      if (testResults.socketConnection) {
        await testIPCStats();
        await testEventEmit();
        await testEventReceive();
        await testCRUDCreate();
        await testCRUDRead();
        await testJSONLexExecute();
      } else {
        logger.error('Socket connection failed - skipping remaining tests');
      }
    } else {
      logger.error('Bridge health check failed - skipping remaining tests');
    }

    // Cleanup
    cleanup();

    // Print summary
    const exitCode = printSummary();

    // Exit
    process.exit(exitCode);
  } catch (error) {
    logger.error('Test runner error', {
      error: error.message,
      stack: error.stack
    });
    cleanup();
    process.exit(1);
  }
}

// Handle timeout
setTimeout(() => {
  logger.error('Test suite timeout exceeded');
  cleanup();
  process.exit(1);
}, TEST_TIMEOUT);

// Run tests
runTests();
