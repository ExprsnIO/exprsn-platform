/**
 * ═══════════════════════════════════════════════════════════
 * Admin Service
 * Comprehensive administration for entire Exprsn ecosystem
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const logger = require('../utils/logger');

// Service base URLs
const SERVICES = {
  ca: process.env.CA_BASE_URL || 'http://localhost:3000',
  auth: process.env.AUTH_BASE_URL || 'http://localhost:3001',
  moderator: process.env.MODERATOR_BASE_URL || 'http://localhost:3006',
  nexus: process.env.NEXUS_BASE_URL || 'http://localhost:3011',
  vault: process.env.VAULT_BASE_URL || 'http://localhost:3013'
};

/**
 * ═══════════════════════════════════════════════════════════
 * CA CERTIFICATE MANAGEMENT
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Generate Root CA Certificate
 */
async function generateRootCertificate(data) {
  try {
    const response = await axios.post(`${SERVICES.ca}/api/certificates/generate-root`, {
      commonName: data.commonName || 'Exprsn Root CA',
      organization: data.organization || 'Exprsn',
      country: data.country || 'US',
      validityYears: data.validityYears || 10
    });

    logger.info('Root CA certificate generated successfully');
    return response.data;
  } catch (error) {
    logger.error('Failed to generate root certificate', { error: error.message });
    throw new Error(`Root certificate generation failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Generate Intermediate CA Certificate
 */
async function generateIntermediateCertificate(data) {
  try {
    const response = await axios.post(`${SERVICES.ca}/api/certificates/generate-intermediate`, {
      commonName: data.commonName || 'Exprsn Intermediate CA',
      organization: data.organization || 'Exprsn',
      country: data.country || 'US',
      validityYears: data.validityYears || 5,
      rootCertificateId: data.rootCertificateId
    });

    logger.info('Intermediate CA certificate generated successfully');
    return response.data;
  } catch (error) {
    logger.error('Failed to generate intermediate certificate', { error: error.message });
    throw new Error(`Intermediate certificate generation failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Generate Code Signing Certificate
 */
async function generateCodeSigningCertificate(data) {
  try {
    const response = await axios.post(`${SERVICES.ca}/api/certificates/generate`, {
      commonName: data.commonName,
      organization: data.organization || 'Exprsn',
      country: data.country || 'US',
      certificateType: 'code_signing',
      validityDays: data.validityDays || 365,
      keyUsage: ['digitalSignature', 'nonRepudiation'],
      extendedKeyUsage: ['codeSigning']
    });

    logger.info('Code signing certificate generated successfully', {
      commonName: data.commonName
    });
    return response.data;
  } catch (error) {
    logger.error('Failed to generate code signing certificate', { error: error.message });
    throw new Error(`Code signing certificate generation failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * List all certificates
 */
async function listCertificates(filters = {}) {
  try {
    const response = await axios.get(`${SERVICES.ca}/api/certificates`, {
      params: filters
    });
    return response.data;
  } catch (error) {
    logger.error('Failed to list certificates', { error: error.message });
    throw new Error(`List certificates failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Revoke certificate
 */
async function revokeCertificate(certificateId, reason) {
  try {
    const response = await axios.post(`${SERVICES.ca}/api/certificates/${certificateId}/revoke`, {
      reason: reason || 'unspecified'
    });

    logger.info('Certificate revoked', { certificateId, reason });
    return response.data;
  } catch (error) {
    logger.error('Failed to revoke certificate', { error: error.message, certificateId });
    throw new Error(`Certificate revocation failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * ═══════════════════════════════════════════════════════════
 * USER MANAGEMENT
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Create user
 */
async function createUser(userData) {
  try {
    const response = await axios.post(`${SERVICES.auth}/api/users`, userData);
    logger.info('User created successfully', { email: userData.email });
    return response.data;
  } catch (error) {
    logger.error('Failed to create user', { error: error.message });
    throw new Error(`User creation failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * List users
 */
async function listUsers(filters = {}) {
  try {
    const response = await axios.get(`${SERVICES.auth}/api/users`, {
      params: filters
    });
    return response.data;
  } catch (error) {
    logger.error('Failed to list users', { error: error.message });
    throw new Error(`List users failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Update user
 */
async function updateUser(userId, updates) {
  try {
    const response = await axios.put(`${SERVICES.auth}/api/users/${userId}`, updates);
    logger.info('User updated successfully', { userId });
    return response.data;
  } catch (error) {
    logger.error('Failed to update user', { error: error.message, userId });
    throw new Error(`User update failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Delete user
 */
async function deleteUser(userId) {
  try {
    const response = await axios.delete(`${SERVICES.auth}/api/users/${userId}`);
    logger.info('User deleted successfully', { userId });
    return response.data;
  } catch (error) {
    logger.error('Failed to delete user', { error: error.message, userId });
    throw new Error(`User deletion failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * ═══════════════════════════════════════════════════════════
 * AUTH PERMISSIONS & SETTINGS
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Create role
 */
async function createRole(roleData) {
  try {
    const response = await axios.post(`${SERVICES.auth}/api/roles`, roleData);
    logger.info('Role created successfully', { name: roleData.name });
    return response.data;
  } catch (error) {
    logger.error('Failed to create role', { error: error.message });
    throw new Error(`Role creation failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * List roles
 */
async function listRoles() {
  try {
    const response = await axios.get(`${SERVICES.auth}/api/roles`);
    return response.data;
  } catch (error) {
    logger.error('Failed to list roles', { error: error.message });
    throw new Error(`List roles failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Assign role to user
 */
async function assignRoleToUser(userId, roleId) {
  try {
    const response = await axios.post(`${SERVICES.auth}/api/users/${userId}/roles`, {
      roleId
    });
    logger.info('Role assigned to user', { userId, roleId });
    return response.data;
  } catch (error) {
    logger.error('Failed to assign role', { error: error.message, userId, roleId });
    throw new Error(`Role assignment failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * ═══════════════════════════════════════════════════════════
 * MODERATION RULES
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Create moderation rule
 */
async function createModerationRule(ruleData) {
  try {
    const response = await axios.post(`${SERVICES.moderator}/api/rules`, ruleData);
    logger.info('Moderation rule created', { name: ruleData.name });
    return response.data;
  } catch (error) {
    logger.error('Failed to create moderation rule', { error: error.message });
    throw new Error(`Moderation rule creation failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Create default moderation rules
 */
async function createDefaultModerationRules() {
  const defaultRules = [
    {
      name: 'Profanity Filter',
      description: 'Auto-flag content with profanity',
      serviceType: '*',
      condition: {
        type: 'content',
        pattern: 'profanity',
        severity: 'medium'
      },
      action: 'flag',
      autoExecute: true,
      priority: 1
    },
    {
      name: 'Spam Detection',
      description: 'Auto-flag potential spam',
      serviceType: '*',
      condition: {
        type: 'content',
        pattern: 'spam',
        severity: 'high'
      },
      action: 'flag',
      autoExecute: true,
      priority: 2
    },
    {
      name: 'Hate Speech',
      description: 'Auto-flag hate speech',
      serviceType: '*',
      condition: {
        type: 'content',
        pattern: 'hate_speech',
        severity: 'critical'
      },
      action: 'hide',
      autoExecute: true,
      priority: 3
    }
  ];

  const results = [];
  for (const rule of defaultRules) {
    try {
      const result = await createModerationRule(rule);
      results.push(result);
    } catch (error) {
      logger.warn('Failed to create default rule', { rule: rule.name, error: error.message });
    }
  }

  return results;
}

/**
 * List moderation rules
 */
async function listModerationRules() {
  try {
    const response = await axios.get(`${SERVICES.moderator}/api/rules`);
    return response.data;
  } catch (error) {
    logger.error('Failed to list moderation rules', { error: error.message });
    throw new Error(`List moderation rules failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * ═══════════════════════════════════════════════════════════
 * GROUPS ADMINISTRATION
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Create group
 */
async function createGroup(groupData) {
  try {
    const response = await axios.post(`${SERVICES.nexus}/api/groups`, groupData);
    logger.info('Group created successfully', { name: groupData.name });
    return response.data;
  } catch (error) {
    logger.error('Failed to create group', { error: error.message });
    throw new Error(`Group creation failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * List groups
 */
async function listGroups(filters = {}) {
  try {
    const response = await axios.get(`${SERVICES.nexus}/api/groups`, {
      params: filters
    });
    return response.data;
  } catch (error) {
    logger.error('Failed to list groups', { error: error.message });
    throw new Error(`List groups failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Update group
 */
async function updateGroup(groupId, updates) {
  try {
    const response = await axios.put(`${SERVICES.nexus}/api/groups/${groupId}`, updates);
    logger.info('Group updated successfully', { groupId });
    return response.data;
  } catch (error) {
    logger.error('Failed to update group', { error: error.message, groupId });
    throw new Error(`Group update failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Delete group
 */
async function deleteGroup(groupId) {
  try {
    const response = await axios.delete(`${SERVICES.nexus}/api/groups/${groupId}`);
    logger.info('Group deleted successfully', { groupId });
    return response.data;
  } catch (error) {
    logger.error('Failed to delete group', { error: error.message, groupId });
    throw new Error(`Group deletion failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * ═══════════════════════════════════════════════════════════
 * SECRETS MANAGEMENT
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Create secret
 */
async function createSecret(secretData) {
  try {
    const response = await axios.post(`${SERVICES.vault}/api/secrets`, secretData);
    logger.info('Secret created successfully', { key: secretData.key });
    return response.data;
  } catch (error) {
    logger.error('Failed to create secret', { error: error.message });
    throw new Error(`Secret creation failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * List secrets
 */
async function listSecrets(path = '/') {
  try {
    const response = await axios.get(`${SERVICES.vault}/api/secrets`, {
      params: { path }
    });
    return response.data;
  } catch (error) {
    logger.error('Failed to list secrets', { error: error.message });
    throw new Error(`List secrets failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Get secret
 */
async function getSecret(key) {
  try {
    const response = await axios.get(`${SERVICES.vault}/api/secrets/${key}`);
    return response.data;
  } catch (error) {
    logger.error('Failed to get secret', { error: error.message, key });
    throw new Error(`Get secret failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Update secret
 */
async function updateSecret(key, value) {
  try {
    const response = await axios.put(`${SERVICES.vault}/api/secrets/${key}`, { value });
    logger.info('Secret updated successfully', { key });
    return response.data;
  } catch (error) {
    logger.error('Failed to update secret', { error: error.message, key });
    throw new Error(`Secret update failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Delete secret
 */
async function deleteSecret(key) {
  try {
    const response = await axios.delete(`${SERVICES.vault}/api/secrets/${key}`);
    logger.info('Secret deleted successfully', { key });
    return response.data;
  } catch (error) {
    logger.error('Failed to delete secret', { error: error.message, key });
    throw new Error(`Secret deletion failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * ═══════════════════════════════════════════════════════════
 * SERVICE LIFECYCLE MANAGEMENT
 * ═══════════════════════════════════════════════════════════
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

// Track running service processes
const runningProcesses = new Map();

// Service definitions
const SERVICE_DEFINITIONS = {
  ca: { name: 'Certificate Authority', port: 3000, path: 'src/exprsn-ca/index.js', critical: true },
  setup: { name: 'Setup & Management', port: 3015, path: 'src/exprsn-setup/src/index.js', critical: false },
  auth: { name: 'Authentication', port: 3001, path: 'src/exprsn-auth/src/index.js', critical: false },
  spark: { name: 'Messaging', port: 3002, path: 'src/exprsn-spark/src/index.js', critical: false },
  timeline: { name: 'Social Feed', port: 3004, path: 'src/exprsn-timeline/src/index.js', critical: false },
  prefetch: { name: 'Timeline Prefetch', port: 3005, path: 'src/exprsn-prefetch/src/index.js', critical: false },
  moderator: { name: 'Content Moderation', port: 3006, path: 'src/exprsn-moderator/src/index.js', critical: false },
  filevault: { name: 'File Storage', port: 3007, path: 'src/exprsn-filevault/src/index.js', critical: false },
  gallery: { name: 'Media Galleries', port: 3008, path: 'src/exprsn-gallery/src/index.js', critical: false },
  live: { name: 'Live Streaming', port: 3009, path: 'src/exprsn-live/src/index.js', critical: false },
  bridge: { name: 'API Gateway', port: 3010, path: 'src/exprsn-bridge/src/index.js', critical: false },
  nexus: { name: 'Groups & Events', port: 3011, path: 'src/exprsn-nexus/src/index.js', critical: false },
  pulse: { name: 'Analytics', port: 3012, path: 'src/exprsn-pulse/src/index.js', critical: false },
  vault: { name: 'Secrets Management', port: 3013, path: 'src/exprsn-vault/src/index.js', critical: false },
  herald: { name: 'Notifications', port: 3014, path: 'src/exprsn-herald/src/index.js', critical: false },
  workflow: { name: 'Workflow Automation', port: 3017, path: 'src/exprsn-workflow/src/index.js', critical: false },
  forge: { name: 'Business Platform', port: 3016, path: 'src/exprsn-forge/src/index.js', critical: false },
  svr: { name: 'Dynamic Page Server', port: 5001, path: 'src/exprsn-svr/index.js', critical: false }
};

/**
 * Start a service
 */
async function startService(serviceKey) {
  const service = SERVICE_DEFINITIONS[serviceKey];

  if (!service) {
    throw new Error(`Unknown service: ${serviceKey}`);
  }

  // Check if already running
  if (runningProcesses.has(serviceKey)) {
    logger.warn(`Service ${serviceKey} is already running`);
    return { status: 'already_running', service: serviceKey };
  }

  const servicePath = path.join(process.cwd(), '..', '..', '..', service.path);

  // Check if service file exists
  try {
    await fs.access(servicePath);
  } catch (error) {
    throw new Error(`Service implementation not found: ${servicePath}`);
  }

  logger.info(`Starting service: ${service.name} (${serviceKey})`);

  const child = spawn('node', [servicePath], {
    env: {
      ...process.env,
      PORT: service.port,
      NODE_ENV: process.env.NODE_ENV || 'development'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  const logs = [];

  child.stdout.on('data', (data) => {
    const message = data.toString().trim();
    logs.push({ type: 'stdout', message, timestamp: new Date() });
    logger.info(`[${serviceKey}] ${message}`);
  });

  child.stderr.on('data', (data) => {
    const message = data.toString().trim();
    logs.push({ type: 'stderr', message, timestamp: new Date() });
    logger.error(`[${serviceKey} ERR] ${message}`);
  });

  child.on('exit', (code, signal) => {
    logger.info(`Service ${serviceKey} exited with code ${code} (signal: ${signal})`);
    runningProcesses.delete(serviceKey);
  });

  child.on('error', (error) => {
    logger.error(`Service ${serviceKey} error:`, error);
    runningProcesses.delete(serviceKey);
  });

  runningProcesses.set(serviceKey, { process: child, logs, startedAt: new Date() });

  // Wait a bit to ensure it started successfully
  await new Promise(resolve => setTimeout(resolve, 2000));

  return {
    status: 'started',
    service: serviceKey,
    name: service.name,
    port: service.port,
    pid: child.pid
  };
}

/**
 * Stop a service
 */
async function stopService(serviceKey) {
  const service = SERVICE_DEFINITIONS[serviceKey];

  if (!service) {
    throw new Error(`Unknown service: ${serviceKey}`);
  }

  const processInfo = runningProcesses.get(serviceKey);

  if (!processInfo) {
    logger.warn(`Service ${serviceKey} is not running`);
    return { status: 'not_running', service: serviceKey };
  }

  logger.info(`Stopping service: ${service.name} (${serviceKey})`);

  return new Promise((resolve) => {
    const { process: child } = processInfo;

    // Set up exit handler
    child.once('exit', () => {
      runningProcesses.delete(serviceKey);
      resolve({
        status: 'stopped',
        service: serviceKey,
        name: service.name
      });
    });

    // Try graceful shutdown first
    child.kill('SIGTERM');

    // Force kill after 5 seconds
    setTimeout(() => {
      if (runningProcesses.has(serviceKey)) {
        logger.warn(`Force killing service ${serviceKey}`);
        child.kill('SIGKILL');
      }
    }, 5000);
  });
}

/**
 * Restart a service
 */
async function restartService(serviceKey) {
  logger.info(`Restarting service: ${serviceKey}`);

  // Stop if running
  if (runningProcesses.has(serviceKey)) {
    await stopService(serviceKey);
  }

  // Wait a bit before restarting
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Start service
  return await startService(serviceKey);
}

/**
 * Get service status
 */
function getServiceStatus(serviceKey) {
  const service = SERVICE_DEFINITIONS[serviceKey];

  if (!service) {
    throw new Error(`Unknown service: ${serviceKey}`);
  }

  const processInfo = runningProcesses.get(serviceKey);

  return {
    service: serviceKey,
    name: service.name,
    port: service.port,
    running: !!processInfo,
    pid: processInfo?.process.pid,
    startedAt: processInfo?.startedAt,
    uptime: processInfo ? Date.now() - processInfo.startedAt.getTime() : 0
  };
}

/**
 * Get all service statuses
 */
function getAllServiceStatuses() {
  return Object.keys(SERVICE_DEFINITIONS).map(key => getServiceStatus(key));
}

/**
 * Get service logs
 */
function getServiceLogs(serviceKey, limit = 100) {
  const processInfo = runningProcesses.get(serviceKey);

  if (!processInfo) {
    return [];
  }

  return processInfo.logs.slice(-limit);
}

/**
 * ═══════════════════════════════════════════════════════════
 * SYSTEM INITIALIZATION OPERATIONS
 * ═══════════════════════════════════════════════════════════
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Create databases
 */
async function createDatabases(options = {}) {
  logger.info('Creating databases...');

  try {
    const scriptPath = path.join(process.cwd(), '..', '..', '..', 'scripts', 'create-databases.sh');
    const env = options.environment || 'development';

    const { stdout, stderr } = await execAsync(`bash "${scriptPath}" --environment=${env}`);

    logger.info('Databases created successfully');
    return {
      success: true,
      output: stdout,
      environment: env
    };
  } catch (error) {
    logger.error('Failed to create databases:', error);
    throw new Error(`Database creation failed: ${error.message}`);
  }
}

/**
 * Run migrations
 */
async function runMigrations(options = {}) {
  logger.info('Running migrations...');

  try {
    const scriptPath = path.join(process.cwd(), '..', '..', '..', 'scripts', 'init-system.js');
    const flags = ['--skip-seeds'];

    if (options.force) flags.push('--force');
    if (options.environment) flags.push(`--environment=${options.environment}`);

    const { stdout, stderr } = await execAsync(`node "${scriptPath}" ${flags.join(' ')}`);

    logger.info('Migrations completed successfully');
    return {
      success: true,
      output: stdout
    };
  } catch (error) {
    logger.error('Failed to run migrations:', error);
    throw new Error(`Migration failed: ${error.message}`);
  }
}

/**
 * Seed default data
 */
async function seedDefaultData(options = {}) {
  logger.info('Seeding default data...');

  try {
    const scriptPath = path.join(process.cwd(), '..', '..', '..', 'scripts', 'seed-defaults.js');
    const env = options.environment || 'development';

    const { stdout, stderr } = await execAsync(`node "${scriptPath}" --environment=${env}`);

    logger.info('Data seeded successfully');
    return {
      success: true,
      output: stdout,
      environment: env
    };
  } catch (error) {
    logger.error('Failed to seed data:', error);
    throw new Error(`Seeding failed: ${error.message}`);
  }
}

/**
 * Run preflight checks
 */
async function runPreflightChecks(options = {}) {
  logger.info('Running preflight checks...');

  try {
    const scriptPath = path.join(process.cwd(), '..', '..', '..', 'scripts', 'preflight-check.js');
    const flags = [];

    if (options.fix) flags.push('--fix');

    const { stdout, stderr } = await execAsync(`node "${scriptPath}" ${flags.join(' ')}`);

    logger.info('Preflight checks completed');
    return {
      success: true,
      output: stdout
    };
  } catch (error) {
    logger.error('Preflight checks failed:', error);
    throw new Error(`Preflight checks failed: ${error.message}`);
  }
}

/**
 * Complete system setup (full initialization)
 */
async function completeSystemSetup(options = {}) {
  logger.info('Starting complete system setup...');

  const results = {
    preflight: null,
    databases: null,
    migrations: null,
    seeds: null,
    certificates: null,
    roles: null,
    moderationRules: null
  };

  try {
    // 1. Run preflight checks
    logger.info('Step 1/7: Running preflight checks...');
    results.preflight = await runPreflightChecks({ fix: options.fix });

    // 2. Create databases
    logger.info('Step 2/7: Creating databases...');
    results.databases = await createDatabases(options);

    // 3. Run migrations
    logger.info('Step 3/7: Running migrations...');
    results.migrations = await runMigrations(options);

    // 4. Seed default data
    if (!options.skipSeeds) {
      logger.info('Step 4/7: Seeding default data...');
      results.seeds = await seedDefaultData(options);
    } else {
      results.seeds = { skipped: true };
    }

    // 5. Generate certificates
    logger.info('Step 5/7: Generating CA certificates...');
    try {
      results.certificates = {
        root: await generateRootCertificate({
          commonName: 'Exprsn Root CA',
          organization: 'Exprsn',
          validityYears: 10
        })
      };
    } catch (error) {
      logger.warn('Certificate generation failed (may already exist):', error.message);
      results.certificates = { skipped: true, reason: error.message };
    }

    // 6. Create default roles
    logger.info('Step 6/7: Creating default roles...');
    try {
      const roles = [
        { name: 'admin', description: 'System administrator', permissions: ['*'] },
        { name: 'moderator', description: 'Content moderator', permissions: ['moderate:*'] },
        { name: 'user', description: 'Regular user', permissions: ['read:*', 'write:own'] }
      ];

      results.roles = [];
      for (const role of roles) {
        try {
          const createdRole = await createRole(role);
          results.roles.push(createdRole);
        } catch (error) {
          logger.warn(`Failed to create role ${role.name}:`, error.message);
        }
      }
    } catch (error) {
      logger.warn('Role creation failed:', error.message);
      results.roles = { skipped: true, reason: error.message };
    }

    // 7. Create default moderation rules
    logger.info('Step 7/7: Creating default moderation rules...');
    try {
      results.moderationRules = await createDefaultModerationRules();
    } catch (error) {
      logger.warn('Moderation rules creation failed:', error.message);
      results.moderationRules = { skipped: true, reason: error.message };
    }

    logger.info('Complete system setup finished successfully');
    return {
      success: true,
      results
    };

  } catch (error) {
    logger.error('System setup failed:', error);
    return {
      success: false,
      error: error.message,
      results
    };
  }
}

/**
 * ═══════════════════════════════════════════════════════════
 * LEGACY: INITIALIZE SYSTEM (kept for backwards compatibility)
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Initialize entire system (legacy)
 */
async function initializeSystem() {
  return await completeSystemSetup({ skipSeeds: false });
}

module.exports = {
  // Certificates
  generateRootCertificate,
  generateIntermediateCertificate,
  generateCodeSigningCertificate,
  listCertificates,
  revokeCertificate,

  // Users
  createUser,
  listUsers,
  updateUser,
  deleteUser,

  // Roles & Permissions
  createRole,
  listRoles,
  assignRoleToUser,

  // Moderation
  createModerationRule,
  createDefaultModerationRules,
  listModerationRules,

  // Groups
  createGroup,
  listGroups,
  updateGroup,
  deleteGroup,

  // Secrets
  createSecret,
  listSecrets,
  getSecret,
  updateSecret,
  deleteSecret,

  // Service Lifecycle
  startService,
  stopService,
  restartService,
  getServiceStatus,
  getAllServiceStatuses,
  getServiceLogs,

  // System Initialization
  createDatabases,
  runMigrations,
  seedDefaultData,
  runPreflightChecks,
  completeSystemSetup,

  // System (legacy)
  initializeSystem
};
