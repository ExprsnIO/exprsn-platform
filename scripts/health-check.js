#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Exprsn Health Check Script
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Checks the health status of all running Exprsn services.
 *
 * Checks:
 * - Service HTTP endpoints are responding
 * - Service health endpoints return healthy status
 * - Database connections are working
 * - Redis connections are working (if enabled)
 * - Background workers are running
 *
 * Usage:
 *   npm run health
 *   node scripts/health-check.js [--service=<name>] [--verbose] [--watch]
 *
 * Options:
 *   --service=<name>  Check only specific service
 *   --verbose         Show detailed output
 *   --watch           Continuously monitor (every 10s)
 *   --json            Output in JSON format
 *
 * Exit codes:
 *   0 - All services healthy
 *   1 - One or more services unhealthy
 *   2 - Some services not running
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const http = require('http');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

const SPECIFIC_SERVICE = process.argv.find(arg => arg.startsWith('--service='))?.split('=')[1];
const VERBOSE = process.argv.includes('--verbose');
const WATCH_MODE = process.argv.includes('--watch');
const JSON_OUTPUT = process.argv.includes('--json');

// Service configurations
const SERVICES = {
  ca: {
    name: 'Certificate Authority',
    port: 3000,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: true,
    worker: false
  },
  setup: {
    name: 'Setup & Management',
    port: 3015,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: false,
    worker: false
  },
  auth: {
    name: 'Authentication & SSO',
    port: 3001,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: true,
    worker: false
  },
  spark: {
    name: 'Real-time Messaging',
    port: 3002,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: true,
    worker: false
  },
  timeline: {
    name: 'Social Feed',
    port: 3004,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: true,
    worker: true,
    workerName: 'timeline-worker'
  },
  prefetch: {
    name: 'Timeline Prefetching',
    port: 3005,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: true,
    worker: false
  },
  moderator: {
    name: 'Content Moderation',
    port: 3006,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: true,
    worker: true,
    workerName: 'moderator-worker'
  },
  filevault: {
    name: 'File Storage',
    port: 3007,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: true,
    worker: false
  },
  gallery: {
    name: 'Media Galleries',
    port: 3008,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: true,
    worker: true,
    workerName: 'gallery-worker'
  },
  live: {
    name: 'Live Streaming',
    port: 3009,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: true,
    worker: false
  },
  bridge: {
    name: 'API Gateway',
    port: 3010,
    healthEndpoint: '/health',
    dbCheck: false,
    redisCheck: true,
    worker: false
  },
  nexus: {
    name: 'Groups & Events',
    port: 3011,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: true,
    worker: false
  },
  pulse: {
    name: 'Analytics',
    port: 3012,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: true,
    worker: false
  },
  vault: {
    name: 'Secrets Management',
    port: 3013,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: false,
    worker: false
  },
  herald: {
    name: 'Notifications',
    port: 3014,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: true,
    worker: true,
    workerName: 'herald-worker'
  },
  svr: {
    name: 'Dynamic Page Server',
    port: 5000,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: false,
    worker: false
  },
  workflow: {
    name: 'Workflow Automation',
    port: 3017,
    healthEndpoint: '/health',
    dbCheck: true,
    redisCheck: true,
    worker: false
  },
  ocsp: {
    name: 'OCSP Responder',
    port: 2560,
    healthEndpoint: '/status',
    dbCheck: false,
    redisCheck: false,
    worker: false
  }
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

// Health check results
const results = {
  services: {},
  summary: {
    total: 0,
    healthy: 0,
    unhealthy: 0,
    notRunning: 0
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

function log(message, color = colors.reset) {
  if (!JSON_OUTPUT) {
    console.log(`${color}${message}${colors.reset}`);
  }
}

function verbose(message) {
  if (VERBOSE && !JSON_OUTPUT) {
    console.log(`${colors.gray}  ${message}${colors.reset}`);
  }
}

/**
 * Make HTTP request to check service health
 */
async function checkServiceHealth(serviceKey, config) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: config.port,
      path: config.healthEndpoint,
      method: 'GET',
      timeout: 5000
    };

    verbose(`Checking ${config.name} at http://localhost:${config.port}${config.healthEndpoint}`);

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const healthData = JSON.parse(data);

          const result = {
            running: true,
            healthy: res.statusCode === 200,
            statusCode: res.statusCode,
            response: healthData,
            timestamp: new Date().toISOString()
          };

          // Check database status
          if (config.dbCheck && healthData.database) {
            result.database = {
              connected: healthData.database.connected || healthData.database.status === 'connected',
              status: healthData.database.status
            };
          }

          // Check Redis status
          if (config.redisCheck && healthData.redis) {
            result.redis = {
              connected: healthData.redis.connected || healthData.redis.status === 'connected',
              status: healthData.redis.status
            };
          }

          // Check worker status
          if (config.worker && healthData.worker) {
            result.worker = {
              running: healthData.worker.running || healthData.worker.status === 'running',
              status: healthData.worker.status
            };
          }

          resolve(result);
        } catch (err) {
          // Response is not JSON
          resolve({
            running: true,
            healthy: res.statusCode === 200,
            statusCode: res.statusCode,
            response: data,
            timestamp: new Date().toISOString()
          });
        }
      });
    });

    req.on('error', (err) => {
      verbose(`Connection error: ${err.message}`);
      resolve({
        running: false,
        healthy: false,
        error: err.message,
        timestamp: new Date().toISOString()
      });
    });

    req.on('timeout', () => {
      req.destroy();
      verbose('Request timeout');
      resolve({
        running: false,
        healthy: false,
        error: 'Timeout',
        timestamp: new Date().toISOString()
      });
    });

    req.end();
  });
}

/**
 * Check if a worker process is running
 */
async function checkWorkerProcess(workerName) {
  try {
    const { stdout } = await execAsync(`pgrep -f ${workerName}`);
    const pids = stdout.trim().split('\n').filter(p => p);
    return {
      running: pids.length > 0,
      count: pids.length,
      pids: pids
    };
  } catch (err) {
    return {
      running: false,
      count: 0,
      pids: []
    };
  }
}

/**
 * Format service status for display
 */
function formatServiceStatus(serviceKey, config, health) {
  const serviceName = `${config.name} (${config.port})`;
  const nameWidth = 40;
  const paddedName = serviceName.padEnd(nameWidth);

  if (!health.running) {
    return `${colors.gray}○ ${paddedName}${colors.reset} ${colors.gray}Not Running${colors.reset}`;
  }

  let statusParts = [];
  let statusColor = colors.green;
  let statusSymbol = '✓';

  if (!health.healthy) {
    statusColor = colors.red;
    statusSymbol = '✗';
    statusParts.push(`HTTP ${health.statusCode}`);
  } else {
    statusParts.push('Running');
  }

  // Database status
  if (config.dbCheck && health.database) {
    if (health.database.connected) {
      statusParts.push('DB ✓');
    } else {
      statusParts.push(`${colors.red}DB ✗${statusColor}`);
      statusSymbol = '⚠';
      statusColor = colors.yellow;
    }
  }

  // Redis status
  if (config.redisCheck && health.redis) {
    if (health.redis.connected) {
      statusParts.push('Redis ✓');
    } else {
      statusParts.push(`${colors.yellow}Redis ✗${statusColor}`);
      if (statusSymbol === '✓') {
        statusSymbol = '⚠';
        statusColor = colors.yellow;
      }
    }
  }

  // Worker status
  if (config.worker && health.worker) {
    if (health.worker.running) {
      statusParts.push('Worker ✓');
    } else {
      statusParts.push(`${colors.yellow}Worker ✗${statusColor}`);
      if (statusSymbol === '✓') {
        statusSymbol = '⚠';
        statusColor = colors.yellow;
      }
    }
  }

  return `${statusColor}${statusSymbol} ${paddedName}${colors.reset} ${statusParts.join(' ')}`;
}

/**
 * Print summary
 */
function printSummary() {
  if (JSON_OUTPUT) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\n${colors.cyan}${'═'.repeat(75)}${colors.reset}`);
  console.log(`${colors.cyan}Summary${colors.reset}`);
  console.log(`${colors.cyan}${'═'.repeat(75)}${colors.reset}\n`);

  const { summary } = results;

  console.log(`${colors.bold}Total Services:${colors.reset}    ${summary.total}`);
  console.log(`${colors.green}Healthy:${colors.reset}           ${summary.healthy}`);
  console.log(`${colors.yellow}Unhealthy:${colors.reset}         ${summary.unhealthy}`);
  console.log(`${colors.gray}Not Running:${colors.reset}       ${summary.notRunning}`);

  console.log('');

  if (summary.unhealthy > 0) {
    console.log(`${colors.yellow}⚠  Some services are unhealthy. Check database and Redis connections.${colors.reset}\n`);
  } else if (summary.notRunning > 0) {
    console.log(`${colors.gray}Some services are not running. Start them with: npm start${colors.reset}\n`);
  } else if (summary.healthy === summary.total && summary.total > 0) {
    console.log(`${colors.green}✓ All services are healthy!${colors.reset}\n`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Health Check
// ═══════════════════════════════════════════════════════════════════════════

async function runHealthChecks() {
  if (!JSON_OUTPUT) {
    console.log(`\n${colors.cyan}╔═══════════════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║                    Exprsn Health Check                                ║${colors.reset}`);
    console.log(`${colors.cyan}╚═══════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

    if (WATCH_MODE) {
      console.log(`${colors.blue}ℹ Watching mode enabled. Press Ctrl+C to exit.${colors.reset}\n`);
    }
  }

  // Filter services if specific service requested
  const servicesToCheck = SPECIFIC_SERVICE
    ? { [SPECIFIC_SERVICE]: SERVICES[SPECIFIC_SERVICE] }
    : SERVICES;

  if (!servicesToCheck || Object.keys(servicesToCheck).length === 0) {
    console.error(`${colors.red}Service '${SPECIFIC_SERVICE}' not found.${colors.reset}`);
    process.exit(1);
  }

  // Check each service
  for (const [serviceKey, config] of Object.entries(servicesToCheck)) {
    const health = await checkServiceHealth(serviceKey, config);

    // Check worker if applicable
    if (config.worker && config.workerName) {
      health.worker = await checkWorkerProcess(config.workerName);
    }

    results.services[serviceKey] = {
      name: config.name,
      port: config.port,
      ...health
    };

    // Update summary
    results.summary.total++;
    if (!health.running) {
      results.summary.notRunning++;
    } else if (health.healthy) {
      results.summary.healthy++;
    } else {
      results.summary.unhealthy++;
    }

    // Print status
    if (!JSON_OUTPUT) {
      console.log(formatServiceStatus(serviceKey, config, health));
    }
  }

  printSummary();

  // Determine exit code
  let exitCode = 0;
  if (results.summary.unhealthy > 0) {
    exitCode = 1;
  } else if (results.summary.notRunning > 0) {
    exitCode = 2;
  }

  return exitCode;
}

/**
 * Run health checks once or in watch mode
 */
async function main() {
  if (WATCH_MODE) {
    // Run continuously
    while (true) {
      await runHealthChecks();

      // Clear screen for next iteration (except in JSON mode)
      if (!JSON_OUTPUT) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        console.clear();
      } else {
        break; // Don't watch in JSON mode
      }
    }
  } else {
    // Run once
    const exitCode = await runHealthChecks();
    process.exit(exitCode);
  }
}

// Handle interrupts in watch mode
process.on('SIGINT', () => {
  if (!JSON_OUTPUT) {
    console.log(`\n${colors.yellow}Health check stopped.${colors.reset}\n`);
  }
  process.exit(0);
});

// Run health checks
main().catch(err => {
  console.error(`${colors.red}Health check failed with error:${colors.reset}`, err);
  process.exit(1);
});
