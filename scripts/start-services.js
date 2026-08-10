#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════
 * Multi-Service Orchestration Script
 * Starts configured Exprsn services based on environment settings
 * Includes automatic health checking before startup
 * ═══════════════════════════════════════════════════════════
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

// Load environment variables from .env file
const dotenvPath = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: dotenvPath });

// Service configuration
// Based on Phase 3 completion: 15 of 18 services production-ready (83%)
const SERVICES = {
  ca: {
    name: 'Certificate Authority',
    port: 3000,
    path: 'src/exprsn-ca/index.js',
    env: {
      PORT: 3000,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: true, // Always start CA
    production: true, // 100% complete
    needsWorker: false
  },
  setup: {
    name: 'Setup & Management',
    port: 3015,
    path: 'src/exprsn-setup/src/index.js',
    env: {
      PORT: 3015,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 100% complete
    needsWorker: false
  },
  auth: {
    name: 'Authentication & SSO',
    port: 3001,
    path: 'src/exprsn-auth/src/index.js',
    env: {
      AUTH_SERVICE_PORT: 3001,
      PORT: 3001,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 100% complete (Phase 1)
    needsWorker: false
  },
  spark: {
    name: 'Real-time Messaging',
    port: 3002,
    path: 'src/exprsn-spark/src/index.js',
    env: {
      PORT: 3002,
      WS_PORT: 3002,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 100% complete with E2EE (Phase 2)
    needsWorker: false
  },
  timeline: {
    name: 'Social Feed',
    port: 3004,
    path: 'src/exprsn-timeline/src/index.js',
    workerPath: 'src/exprsn-timeline/src/worker.js',
    env: {
      PORT: 3004,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 100% complete
    needsWorker: true
  },
  prefetch: {
    name: 'Timeline Prefetching',
    port: 3005,
    path: 'src/exprsn-prefetch/src/index.js',
    env: {
      PORT: 3005,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 100% complete
    needsWorker: false
  },
  moderator: {
    name: 'Content Moderation',
    port: 3006,
    path: 'src/exprsn-moderator/src/index.js',
    workerPath: 'src/exprsn-moderator/src/workers/bull-worker.js',
    env: {
      PORT: 3006,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 95% complete (Phase 2)
    needsWorker: true
  },
  filevault: {
    name: 'File Storage',
    port: 3007,
    path: 'src/exprsn-filevault/src/index.js',
    env: {
      PORT: 3007,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 100% complete (Phase 3)
    needsWorker: false
  },
  gallery: {
    name: 'Media Galleries',
    port: 3008,
    path: 'src/exprsn-gallery/src/index.js',
    workerPath: 'src/exprsn-gallery/src/workers/media.js',
    env: {
      PORT: 3008,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 90% complete (Phase 3)
    needsWorker: true
  },
  live: {
    name: 'Live Streaming',
    port: 3009,
    path: 'src/exprsn-live/src/index.js',
    env: {
      PORT: 3009,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 100% complete - production ready
    needsWorker: false
  },
  bridge: {
    name: 'API Gateway',
    port: 3010,
    path: 'src/exprsn-bridge/src/index.js',
    env: {
      PORT: 3010,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 100% complete
    needsWorker: false
  },
  nexus: {
    name: 'Groups & Events',
    port: 3011,
    path: 'src/exprsn-nexus/src/index.js',
    env: {
      PORT: 3011,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 100% complete
    needsWorker: false
  },
  pulse: {
    name: 'Analytics & Metrics',
    port: 3012,
    path: 'src/exprsn-pulse/src/index.js',
    env: {
      PORT: 3012,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 100% complete
    needsWorker: false
  },
  vault: {
    name: 'Secrets Management',
    port: 3013,
    path: 'src/exprsn-vault/src/index.js',
    env: {
      PORT: 3013,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 100% complete
    needsWorker: false
  },
  herald: {
    name: 'Notifications & Alerts',
    port: 3014,
    path: 'src/exprsn-herald/src/index.js',
    workerPath: 'src/exprsn-herald/src/jobs/index.js',
    env: {
      PORT: 3014,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 100% complete (Phase 1)
    needsWorker: true
  },
  svr: {
    name: 'Dynamic Page Server',
    port: 5001,
    path: 'src/exprsn-svr/index.js',
    env: {
      PORT: 5001,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 100% complete
    needsWorker: false
  },
  workflow: {
    name: 'Workflow Automation',
    port: 3017,
    path: 'src/exprsn-workflow/src/index.js',
    env: {
      PORT: 3017,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    critical: false,
    production: true, // 100% complete
    needsWorker: false
  }
  // Note: Forge Business Platform is now integrated into exprsn-svr (Port 5001)
  // Access via https://localhost:5001/forge
};

// Running processes
const runningServices = new Map();

/**
 * Check if a port is in use
 */
async function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true); // Port is in use
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(false); // Port is available
    });

    server.listen(port, '0.0.0.0');
  });
}

/**
 * Check if a service is healthy
 */
async function checkServiceHealth(serviceKey, service) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: service.port,
      path: '/health',
      method: 'GET',
      timeout: 3000
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const healthData = JSON.parse(data);
          const isHealthy = res.statusCode === 200 &&
                           (!healthData.database || healthData.database.connected !== false) &&
                           (!healthData.redis || healthData.redis.connected !== false) &&
                           (!healthData.worker || healthData.worker.running !== false);

          resolve({
            running: true,
            healthy: isHealthy,
            statusCode: res.statusCode,
            data: healthData
          });
        } catch (err) {
          // Non-JSON response, check status code only
          resolve({
            running: true,
            healthy: res.statusCode === 200,
            statusCode: res.statusCode
          });
        }
      });
    });

    req.on('error', () => {
      resolve({
        running: false,
        healthy: false
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        running: false,
        healthy: false
      });
    });

    req.end();
  });
}

/**
 * Validate that setup has been completed
 */
function validateSetup() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Exprsn Multi-Service Orchestration');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('[SETUP] Validating environment setup...\n');

  const setupChecks = [];
  const warnings = [];

  // Check 1: .env file exists
  if (!fs.existsSync(dotenvPath)) {
    setupChecks.push({
      name: '.env file',
      passed: false,
      message: '.env file not found. Please copy .env.example to .env'
    });
  } else {
    setupChecks.push({
      name: '.env file',
      passed: true,
      message: '.env file exists'
    });
  }

  // Check 2: Required environment variables
  const requiredVars = ['DB_HOST', 'DB_NAME', 'DB_USER'];
  const missingVars = requiredVars.filter(v => !process.env[v]);

  if (missingVars.length > 0) {
    setupChecks.push({
      name: 'Environment variables',
      passed: false,
      message: `Missing required variables: ${missingVars.join(', ')}`
    });
  } else {
    setupChecks.push({
      name: 'Environment variables',
      passed: true,
      message: 'Required environment variables set'
    });
  }

  // Check 3: JWT keys (warning only)
  if (!process.env.JWT_PRIVATE_KEY || !process.env.JWT_PUBLIC_KEY) {
    warnings.push('JWT keys not set. Run `npm run setup` to generate keys.');
  }

  // Check 4: Session secret (warning only)
  if (!process.env.SESSION_SECRET) {
    warnings.push('SESSION_SECRET not set. Run `npm run setup` to generate secret.');
  }

  // Display results
  setupChecks.forEach(check => {
    const icon = check.passed ? '✓' : '✗';
    const status = check.passed ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${icon} ${check.name}: ${check.message}`);
  });

  if (warnings.length > 0) {
    console.log('\n[WARN] Setup warnings:');
    warnings.forEach(w => console.log(`       ${w}`));
  }

  console.log('');

  // Fail if critical checks didn't pass
  const failed = setupChecks.filter(c => !c.passed);
  if (failed.length > 0) {
    console.error('[ERROR] Setup validation failed. Please complete setup first:');
    console.error('        1. Copy .env.example to .env');
    console.error('        2. Configure database settings in .env');
    console.error('        3. Run `npm run setup` to generate keys and secrets\n');
    process.exit(1);
  }

  console.log('[SETUP] ✓ Setup validation passed\n');
}

// Validate setup before starting services
validateSetup();

// Parse AUTO_START_SERVICES from .env
// Format: AUTO_START_SERVICES=ca,auth,spark,timeline
// If not set and npm start is called, start all production services
let autoStartServices;

if (process.env.AUTO_START_SERVICES) {
  autoStartServices = process.env.AUTO_START_SERVICES
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);
} else {
  // Default: start all production-ready services
  autoStartServices = Object.keys(SERVICES).filter(key => SERVICES[key].production);
}

console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Auto-start services: ${autoStartServices.join(', ')}\n`);

/**
 * Start a service
 */
async function startService(serviceKey) {
  const service = SERVICES[serviceKey];

  if (!service) {
    console.error(`[ERROR] Unknown service: ${serviceKey}`);
    return false;
  }

  const servicePath = path.join(__dirname, '..', service.path);

  // Check if service file exists
  if (!fs.existsSync(servicePath)) {
    console.log(`[SKIP] ${service.name} - Implementation not found`);
    console.log(`       Expected: ${servicePath}`);
    return false;
  }

  // Check if port is already in use
  const portInUse = await isPortInUse(service.port);
  if (portInUse) {
    console.log(`[SKIP] ${service.name} - Port ${service.port} already in use (service likely running)`);
    return false;
  }

  console.log(`[START] ${service.name} on port ${service.port}...`);

  const child = spawn('node', [servicePath], {
    env: { ...process.env, ...service.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (data) => {
    console.log(`[${serviceKey.toUpperCase()}] ${data.toString().trim()}`);
  });

  child.stderr.on('data', (data) => {
    console.error(`[${serviceKey.toUpperCase()} ERR] ${data.toString().trim()}`);
  });

  child.on('error', (error) => {
    console.error(`[ERROR] ${service.name} failed to start:`, error.message);
    if (service.critical) {
      console.error('[CRITICAL] Critical service failed. Shutting down all services.');
      shutdownAll();
      process.exit(1);
    }
  });

  child.on('exit', (code, signal) => {
    console.log(`[EXIT] ${service.name} exited with code ${code} (signal: ${signal})`);
    runningServices.delete(serviceKey);
    runningServices.delete(`${serviceKey}-worker`);

    if (service.critical && code !== 0) {
      console.error('[CRITICAL] Critical service crashed. Shutting down all services.');
      shutdownAll();
      process.exit(1);
    }
  });

  runningServices.set(serviceKey, child);

  // Start background worker if needed
  if (service.needsWorker && service.workerPath) {
    startWorker(serviceKey, service);
  }

  return true;
}

/**
 * Start a background worker for a service
 */
function startWorker(serviceKey, service) {
  const workerPath = path.join(__dirname, '..', service.workerPath);

  // Check if worker file exists
  if (!fs.existsSync(workerPath)) {
    console.log(`[SKIP] ${service.name} Worker - Implementation not found`);
    console.log(`       Expected: ${workerPath}`);
    return false;
  }

  console.log(`[START] ${service.name} Worker...`);

  const worker = spawn('node', [workerPath], {
    env: { ...process.env, ...service.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  worker.stdout.on('data', (data) => {
    console.log(`[${serviceKey.toUpperCase()}-WORKER] ${data.toString().trim()}`);
  });

  worker.stderr.on('data', (data) => {
    console.error(`[${serviceKey.toUpperCase()}-WORKER ERR] ${data.toString().trim()}`);
  });

  worker.on('error', (error) => {
    console.error(`[ERROR] ${service.name} Worker failed to start:`, error.message);
  });

  worker.on('exit', (code, signal) => {
    console.log(`[EXIT] ${service.name} Worker exited with code ${code} (signal: ${signal})`);
    runningServices.delete(`${serviceKey}-worker`);
  });

  runningServices.set(`${serviceKey}-worker`, worker);
  return true;
}

/**
 * Shutdown all services gracefully
 */
function shutdownAll() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Shutting down all services...');
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const [key, child] of runningServices.entries()) {
    // Extract service key (remove -worker suffix if present)
    const baseKey = key.replace('-worker', '');
    const service = SERVICES[baseKey];
    const serviceName = service ? service.name : key;

    console.log(`[SHUTDOWN] ${serviceName}...`);
    child.kill('SIGTERM');

    // Force kill after 5 seconds
    setTimeout(() => {
      if (!child.killed) {
        console.log(`[FORCE KILL] ${serviceName}`);
        child.kill('SIGKILL');
      }
    }, 5000);
  }

  setTimeout(() => {
    console.log('\nAll services stopped.');
    process.exit(0);
  }, 6000);
}

// Handle shutdown signals
process.on('SIGINT', shutdownAll);
process.on('SIGTERM', shutdownAll);

// Check health and start services
async function startServicesWithHealthCheck() {
  console.log('[HEALTH] Checking service health before startup...\n');

  const healthChecks = [];
  const servicesToStart = [];

  // Check health of all services that should be auto-started
  for (const serviceKey of autoStartServices) {
    const service = SERVICES[serviceKey];
    if (service) {
      healthChecks.push(
        checkServiceHealth(serviceKey, service).then(health => ({
          serviceKey,
          service,
          health
        }))
      );
    }
  }

  // Wait for all health checks to complete
  const results = await Promise.all(healthChecks);

  // Analyze results and determine which services need to be started
  for (const { serviceKey, service, health } of results) {
    if (!health.running) {
      console.log(`[HEALTH] ${service.name} - Not Running → Will start`);
      servicesToStart.push(serviceKey);
    } else if (!health.healthy) {
      console.log(`[HEALTH] ${service.name} - Unhealthy (${health.statusCode}) → Will restart`);
      // Kill unhealthy service before restarting
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        await execAsync(`lsof -ti :${service.port} | xargs kill -9 2>/dev/null || true`);
        console.log(`[HEALTH] Stopped unhealthy ${service.name}`);
      } catch (err) {
        // Ignore errors
      }
      servicesToStart.push(serviceKey);
    } else {
      console.log(`[HEALTH] ${service.name} - Healthy ✓ Skipping`);
    }
  }

  console.log('');

  // Start only the services that need to be started
  let startedCount = 0;
  if (servicesToStart.length > 0) {
    console.log(`[START] Starting ${servicesToStart.length} service(s)...\n`);
    for (const serviceKey of servicesToStart) {
      if (await startService(serviceKey)) {
        startedCount++;
      }
    }
    console.log(`\n✓ ${startedCount} service(s) started successfully\n`);
  } else {
    console.log('[HEALTH] All services are healthy. Nothing to start.\n');
  }

  console.log('Press Ctrl+C to stop all services\n');
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Start services with health check
startServicesWithHealthCheck().catch(err => {
  console.error('[ERROR] Failed to start services:', err.message);
  process.exit(1);
});

// Keep process alive
process.stdin.resume();
