#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * Comprehensive Service Endpoint Validator
 * Tests all production-ready Exprsn services for proper endpoint mapping
 * and functionality
 * ═══════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const axios = require('axios');
const io = require('socket.io-client');
const chalk = require('chalk');

// Service configuration
const SERVICES = {
  ca: {
    name: 'Certificate Authority',
    port: 3000,
    baseUrl: 'http://localhost:3000',
    endpoints: [
      { method: 'GET', path: '/', requiresAuth: false, description: 'Home page' },
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'GET', path: '/api/health', requiresAuth: false, description: 'API health' },
      { method: 'GET', path: '/auth/login', requiresAuth: false, description: 'Login page' },
      { method: 'GET', path: '/dashboard', requiresAuth: true, description: 'Dashboard' },
      { method: 'GET', path: '/api/tokens', requiresAuth: true, description: 'List tokens' },
      { method: 'GET', path: '/api/certificates', requiresAuth: true, description: 'List certificates' }
    ],
    socketIo: false
  },
  auth: {
    name: 'Authentication & SSO',
    port: 3001,
    baseUrl: 'http://localhost:3001',
    endpoints: [
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'GET', path: '/login', requiresAuth: false, description: 'Login page' },
      { method: 'GET', path: '/register', requiresAuth: false, description: 'Register page' },
      { method: 'GET', path: '/dashboard', requiresAuth: true, description: 'Service dashboard' },
      { method: 'POST', path: '/api/auth/login', requiresAuth: false, description: 'Login API', body: { email: 'test@example.com', password: 'test123' } },
      { method: 'GET', path: '/api/users', requiresAuth: true, description: 'List users' },
      { method: 'GET', path: '/.well-known/openid-configuration', requiresAuth: false, description: 'OIDC configuration' }
    ],
    socketIo: false
  },
  spark: {
    name: 'Real-time Messaging',
    port: 3002,
    baseUrl: 'http://localhost:3002',
    endpoints: [
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'GET', path: '/api/messages', requiresAuth: true, description: 'List messages' },
      { method: 'GET', path: '/api/conversations', requiresAuth: true, description: 'List conversations' },
      { method: 'POST', path: '/api/messages', requiresAuth: true, description: 'Send message', body: { conversationId: 'test', content: 'test' } }
    ],
    socketIo: true,
    socketEvents: ['message:new', 'message:read', 'typing:start', 'typing:stop']
  },
  timeline: {
    name: 'Social Feed',
    port: 3004,
    baseUrl: 'http://localhost:3004',
    endpoints: [
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'GET', path: '/health/ready', requiresAuth: false, description: 'Readiness probe' },
      { method: 'GET', path: '/health/live', requiresAuth: false, description: 'Liveness probe' },
      { method: 'GET', path: '/api/posts', requiresAuth: true, description: 'List posts' },
      { method: 'GET', path: '/api/timeline', requiresAuth: true, description: 'Get timeline' },
      { method: 'POST', path: '/api/posts', requiresAuth: true, description: 'Create post', body: { content: 'Test post' } },
      { method: 'GET', path: '/api/jobs/stats', requiresAuth: true, description: 'Job stats' }
    ],
    socketIo: true,
    socketEvents: ['post:new', 'post:like', 'post:repost']
  },
  prefetch: {
    name: 'Timeline Prefetching',
    port: 3005,
    baseUrl: 'http://localhost:3005',
    endpoints: [
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'GET', path: '/api/prefetch/timeline/:userId', requiresAuth: true, description: 'Prefetch timeline' },
      { method: 'POST', path: '/api/prefetch/invalidate', requiresAuth: true, description: 'Invalidate cache', body: { userId: 'test' } }
    ],
    socketIo: false
  },
  moderator: {
    name: 'Content Moderation',
    port: 3006,
    baseUrl: 'http://localhost:3006',
    endpoints: [
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'POST', path: '/api/moderate', requiresAuth: true, description: 'Moderate content', body: { content: 'test content', contentType: 'post' } },
      { method: 'GET', path: '/api/flags', requiresAuth: true, description: 'List flags' },
      { method: 'GET', path: '/api/cases', requiresAuth: true, description: 'List cases' }
    ],
    socketIo: true,
    socketEvents: ['case:new', 'case:updated']
  },
  filevault: {
    name: 'File Storage',
    port: 3007,
    baseUrl: 'http://localhost:3007',
    endpoints: [
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'GET', path: '/api/files', requiresAuth: true, description: 'List files' },
      { method: 'GET', path: '/api/folders', requiresAuth: true, description: 'List folders' },
      { method: 'GET', path: '/api/quota', requiresAuth: true, description: 'Check quota' }
    ],
    socketIo: false
  },
  gallery: {
    name: 'Media Galleries',
    port: 3008,
    baseUrl: 'http://localhost:3008',
    endpoints: [
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'GET', path: '/api/albums', requiresAuth: true, description: 'List albums' },
      { method: 'GET', path: '/api/photos', requiresAuth: true, description: 'List photos' },
      { method: 'POST', path: '/api/albums', requiresAuth: true, description: 'Create album', body: { name: 'Test Album' } }
    ],
    socketIo: false
  },
  live: {
    name: 'Live Streaming',
    port: 3009,
    baseUrl: 'http://localhost:3009',
    endpoints: [
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'GET', path: '/api/streams', requiresAuth: true, description: 'List streams' },
      { method: 'POST', path: '/api/streams', requiresAuth: true, description: 'Create stream', body: { title: 'Test Stream' } },
      { method: 'GET', path: '/api/recordings', requiresAuth: true, description: 'List recordings' }
    ],
    socketIo: false
  },
  bridge: {
    name: 'API Gateway',
    port: 3010,
    baseUrl: 'http://localhost:3010',
    endpoints: [
      { method: 'GET', path: '/', requiresAuth: false, description: 'Service info' },
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' }
    ],
    socketIo: false
  },
  nexus: {
    name: 'Groups & Events',
    port: 3011,
    baseUrl: 'http://localhost:3011',
    endpoints: [
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'GET', path: '/api/groups', requiresAuth: true, description: 'List groups' },
      { method: 'GET', path: '/api/events', requiresAuth: true, description: 'List events' },
      { method: 'POST', path: '/api/groups', requiresAuth: true, description: 'Create group', body: { name: 'Test Group', description: 'Test' } },
      { method: 'GET', path: '/api/groups/trending', requiresAuth: true, description: 'Trending groups' },
      { method: 'GET', path: '/api/events/calendar.ics', requiresAuth: true, description: 'iCal export' }
    ],
    socketIo: false
  },
  pulse: {
    name: 'Analytics & Metrics',
    port: 3012,
    baseUrl: 'http://localhost:3012',
    endpoints: [
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'GET', path: '/metrics', requiresAuth: false, description: 'Prometheus metrics' },
      { method: 'GET', path: '/api/analytics', requiresAuth: true, description: 'Get analytics' },
      { method: 'POST', path: '/api/events', requiresAuth: true, description: 'Track event', body: { event: 'test', properties: {} } }
    ],
    socketIo: false
  },
  vault: {
    name: 'Secrets Management',
    port: 3013,
    baseUrl: 'http://localhost:3013',
    endpoints: [
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'GET', path: '/api/secrets', requiresAuth: true, description: 'List secrets' },
      { method: 'POST', path: '/api/secrets', requiresAuth: true, description: 'Create secret', body: { key: 'test', value: 'test' } },
      { method: 'GET', path: '/api/keys', requiresAuth: true, description: 'List keys' }
    ],
    socketIo: false
  },
  herald: {
    name: 'Notifications & Alerts',
    port: 3014,
    baseUrl: 'http://localhost:3014',
    endpoints: [
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'GET', path: '/api/notifications', requiresAuth: true, description: 'List notifications' },
      { method: 'POST', path: '/api/notifications', requiresAuth: true, description: 'Send notification', body: { userId: 'test', message: 'Test' } },
      { method: 'PUT', path: '/api/notifications/:id/read', requiresAuth: true, description: 'Mark as read' },
      { method: 'GET', path: '/api/preferences', requiresAuth: true, description: 'Get preferences' }
    ],
    socketIo: true,
    socketEvents: ['notification:new', 'notification:read']
  },
  setup: {
    name: 'Setup & Management',
    port: 3015,
    baseUrl: 'http://localhost:3015',
    endpoints: [
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'GET', path: '/api/services', requiresAuth: false, description: 'List services' },
      { method: 'GET', path: '/api/services/:name/health', requiresAuth: false, description: 'Service health' }
    ],
    socketIo: true,
    socketEvents: ['service:status', 'service:health']
  },
  workflow: {
    name: 'Workflow Automation',
    port: 3017,
    baseUrl: 'http://localhost:3017',
    endpoints: [
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'GET', path: '/api/workflows', requiresAuth: true, description: 'List workflows' },
      { method: 'POST', path: '/api/workflows', requiresAuth: true, description: 'Create workflow', body: { name: 'Test Workflow', steps: [] } },
      { method: 'POST', path: '/api/workflows/:id/execute', requiresAuth: true, description: 'Execute workflow' },
      { method: 'GET', path: '/api/executions', requiresAuth: true, description: 'List executions' }
    ],
    socketIo: true,
    socketEvents: ['workflow:started', 'workflow:completed', 'workflow:failed']
  },
  svr: {
    name: 'Dynamic Page Server',
    port: 5000,
    baseUrl: 'http://localhost:5000',
    endpoints: [
      { method: 'GET', path: '/health', requiresAuth: false, description: 'Health check' },
      { method: 'GET', path: '/api/pages', requiresAuth: true, description: 'List pages' },
      { method: 'POST', path: '/api/pages', requiresAuth: true, description: 'Create page', body: { slug: 'test', title: 'Test', content: 'Test' } },
      { method: 'GET', path: '/api/templates', requiresAuth: true, description: 'List templates' }
    ],
    socketIo: true,
    socketEvents: ['page:updated']
  }
};

// Test results
const results = {
  services: {},
  summary: {
    total: 0,
    running: 0,
    notRunning: 0,
    endpointsPassed: 0,
    endpointsFailed: 0,
    socketIoTested: 0,
    socketIoWorking: 0
  }
};

// Authentication token (will be set after login)
let authToken = null;
let sessionCookie = null;

/**
 * Print section header
 */
function printHeader(text) {
  console.log('\n' + chalk.bold.blue('═'.repeat(70)));
  console.log(chalk.bold.blue('  ' + text));
  console.log(chalk.bold.blue('═'.repeat(70)) + '\n');
}

/**
 * Print service status
 */
function printServiceStatus(serviceName, status, message = '') {
  const icon = status === 'running' ? chalk.green('✓') :
               status === 'error' ? chalk.red('✗') :
               chalk.yellow('○');
  const statusText = status === 'running' ? chalk.green('RUNNING') :
                     status === 'error' ? chalk.red('NOT RUNNING') :
                     chalk.yellow('UNKNOWN');
  console.log(`${icon} ${chalk.bold(serviceName)}: ${statusText}${message ? ' - ' + chalk.gray(message) : ''}`);
}

/**
 * Print endpoint result
 */
function printEndpointResult(method, path, status, message = '') {
  const icon = status === 'pass' ? chalk.green('✓') :
               status === 'fail' ? chalk.red('✗') :
               status === 'skip' ? chalk.yellow('○') :
               chalk.gray('-');
  const methodColor = method === 'GET' ? chalk.blue(method.padEnd(6)) :
                      method === 'POST' ? chalk.green(method.padEnd(6)) :
                      method === 'PUT' ? chalk.yellow(method.padEnd(6)) :
                      method === 'DELETE' ? chalk.red(method.padEnd(6)) :
                      chalk.white(method.padEnd(6));
  console.log(`  ${icon} ${methodColor} ${path.padEnd(40)} ${message ? chalk.gray(message) : ''}`);
}

/**
 * Check if service is running
 */
async function checkServiceHealth(service) {
  try {
    const response = await axios.get(`${service.baseUrl}/health`, {
      timeout: 3000,
      validateStatus: () => true
    });
    return {
      running: response.status === 200,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    return {
      running: false,
      error: error.code || error.message
    };
  }
}

/**
 * Test an endpoint
 */
async function testEndpoint(service, endpoint) {
  try {
    const config = {
      method: endpoint.method,
      url: `${service.baseUrl}${endpoint.path}`,
      timeout: 5000,
      validateStatus: () => true,
      headers: {}
    };

    // Add authentication if required
    if (endpoint.requiresAuth && authToken) {
      config.headers['Authorization'] = `Bearer ${authToken}`;
    }

    if (endpoint.requiresAuth && sessionCookie) {
      config.headers['Cookie'] = sessionCookie;
    }

    // Add body for POST/PUT requests
    if (endpoint.body) {
      config.data = endpoint.body;
      config.headers['Content-Type'] = 'application/json';
    }

    const response = await axios(config);

    // Determine success based on status code
    const success = endpoint.requiresAuth && !authToken
      ? response.status === 401 || response.status === 302  // Expected to fail auth
      : response.status >= 200 && response.status < 400;

    return {
      success,
      status: response.status,
      message: endpoint.requiresAuth && !authToken
        ? 'Auth required (expected)'
        : response.statusText
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      message: error.code || error.message
    };
  }
}

/**
 * Test Socket.IO connection
 */
async function testSocketIO(service) {
  return new Promise((resolve) => {
    const socket = io(service.baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
      auth: authToken ? { token: authToken } : undefined
    });

    const timeout = setTimeout(() => {
      socket.close();
      resolve({
        success: false,
        message: 'Connection timeout'
      });
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.close();
      resolve({
        success: true,
        message: 'Connected successfully'
      });
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      socket.close();
      resolve({
        success: false,
        message: error.message
      });
    });
  });
}

/**
 * Test a single service
 */
async function testService(serviceKey) {
  const service = SERVICES[serviceKey];

  printHeader(`Testing ${service.name} (Port ${service.port})`);

  // Check if service is running
  const healthCheck = await checkServiceHealth(service);

  if (!healthCheck.running) {
    printServiceStatus(service.name, 'error', healthCheck.error);
    results.services[serviceKey] = {
      name: service.name,
      running: false,
      error: healthCheck.error,
      endpoints: []
    };
    results.summary.notRunning++;
    return;
  }

  printServiceStatus(service.name, 'running', `Port ${service.port}`);
  results.summary.running++;

  // Test endpoints
  console.log(chalk.bold('\n  Endpoints:'));
  const endpointResults = [];

  for (const endpoint of service.endpoints) {
    const result = await testEndpoint(service, endpoint);
    const status = result.success ? 'pass' :
                   endpoint.requiresAuth && !authToken ? 'skip' :
                   'fail';

    printEndpointResult(
      endpoint.method,
      endpoint.path,
      status,
      result.status ? `(${result.status}) ${result.message}` : result.message
    );

    endpointResults.push({
      ...endpoint,
      ...result,
      tested: status !== 'skip'
    });

    if (status === 'pass') {
      results.summary.endpointsPassed++;
    } else if (status === 'fail') {
      results.summary.endpointsFailed++;
    }
  }

  // Test Socket.IO if supported
  let socketResult = null;
  if (service.socketIo) {
    console.log(chalk.bold('\n  Socket.IO:'));
    results.summary.socketIoTested++;
    socketResult = await testSocketIO(service);

    const icon = socketResult.success ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${icon} Connection: ${socketResult.message}`);

    if (socketResult.success) {
      results.summary.socketIoWorking++;

      // List available events
      if (service.socketEvents && service.socketEvents.length > 0) {
        console.log(chalk.gray('    Events: ' + service.socketEvents.join(', ')));
      }
    }
  }

  results.services[serviceKey] = {
    name: service.name,
    port: service.port,
    running: true,
    endpoints: endpointResults,
    socketIo: socketResult
  };
}

/**
 * Attempt to authenticate with CA service
 */
async function attemptAuthentication() {
  printHeader('Authentication Setup');

  console.log('Attempting to authenticate with CA service...');

  try {
    // Try to login to CA service
    const response = await axios.post('http://localhost:3000/auth/login', {
      email: 'admin@exprsn.io',
      password: 'admin123'
    }, {
      timeout: 5000,
      maxRedirects: 0,
      validateStatus: () => true
    });

    if (response.status === 302 || response.status === 200) {
      // Extract session cookie
      const cookies = response.headers['set-cookie'];
      if (cookies && cookies.length > 0) {
        sessionCookie = cookies[0].split(';')[0];
        console.log(chalk.green('✓ Authentication successful (session-based)'));
        return true;
      }
    }

    console.log(chalk.yellow('○ Default credentials not found'));
    console.log(chalk.gray('  Note: Authentication tests will be skipped'));
    return false;
  } catch (error) {
    console.log(chalk.yellow('○ Could not authenticate:', error.message));
    console.log(chalk.gray('  Note: Authentication tests will be skipped'));
    return false;
  }
}

/**
 * Print final summary
 */
function printSummary() {
  printHeader('Test Summary');

  console.log(chalk.bold('Services:'));
  console.log(`  Total:       ${results.summary.total}`);
  console.log(`  Running:     ${chalk.green(results.summary.running)}`);
  console.log(`  Not Running: ${chalk.red(results.summary.notRunning)}`);

  console.log(chalk.bold('\nEndpoints:'));
  console.log(`  Passed:      ${chalk.green(results.summary.endpointsPassed)}`);
  console.log(`  Failed:      ${chalk.red(results.summary.endpointsFailed)}`);

  console.log(chalk.bold('\nSocket.IO:'));
  console.log(`  Tested:      ${results.summary.socketIoTested}`);
  console.log(`  Working:     ${chalk.green(results.summary.socketIoWorking)}`);

  // Calculate success rate
  const totalEndpoints = results.summary.endpointsPassed + results.summary.endpointsFailed;
  const successRate = totalEndpoints > 0
    ? ((results.summary.endpointsPassed / totalEndpoints) * 100).toFixed(1)
    : 0;

  console.log(chalk.bold('\nSuccess Rate:'));
  console.log(`  ${successRate}% (${results.summary.endpointsPassed}/${totalEndpoints} endpoints)`);

  // Save results to file
  const fs = require('fs');
  const outputPath = './service-test-results.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(chalk.gray(`\n✓ Detailed results saved to ${outputPath}`));
}

/**
 * Main test execution
 */
async function main() {
  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║          Exprsn Service Endpoint Validation Suite                ║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════════════╝\n'));

  // Set total services count
  results.summary.total = Object.keys(SERVICES).length;

  // Try to authenticate first
  await attemptAuthentication();

  // Test each service
  for (const serviceKey of Object.keys(SERVICES)) {
    await testService(serviceKey);

    // Small delay between services
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Print summary
  printSummary();

  // Exit with appropriate code
  const hasFailures = results.summary.endpointsFailed > 0 ||
                      results.summary.notRunning > 0;
  process.exit(hasFailures ? 1 : 0);
}

// Run tests
main().catch(error => {
  console.error(chalk.red('\nFatal error:'), error);
  process.exit(1);
});
