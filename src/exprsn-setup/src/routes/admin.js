/**
 * ═══════════════════════════════════════════════════════════
 * Admin Routes
 * Comprehensive administration endpoints for Exprsn ecosystem
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const adminService = require('../services/adminService');
const logger = require('../utils/logger');

/**
 * ═══════════════════════════════════════════════════════════
 * CA CERTIFICATE MANAGEMENT ROUTES
 * ═══════════════════════════════════════════════════════════
 */

// POST /api/admin/certificates/root - Generate Root CA
router.post('/certificates/root', async (req, res) => {
  try {
    const result = await adminService.generateRootCertificate(req.body);
    res.json({
      success: true,
      message: 'Root CA certificate generated successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to generate root certificate', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/certificates/intermediate - Generate Intermediate CA
router.post('/certificates/intermediate', async (req, res) => {
  try {
    const result = await adminService.generateIntermediateCertificate(req.body);
    res.json({
      success: true,
      message: 'Intermediate CA certificate generated successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to generate intermediate certificate', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/certificates/code-signing - Generate Code Signing Certificate
router.post('/certificates/code-signing', async (req, res) => {
  try {
    const result = await adminService.generateCodeSigningCertificate(req.body);
    res.json({
      success: true,
      message: 'Code signing certificate generated successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to generate code signing certificate', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/admin/certificates - List all certificates
router.get('/certificates', async (req, res) => {
  try {
    const result = await adminService.listCertificates(req.query);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to list certificates', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/certificates/:id/revoke - Revoke certificate
router.post('/certificates/:id/revoke', async (req, res) => {
  try {
    const result = await adminService.revokeCertificate(req.params.id, req.body.reason);
    res.json({
      success: true,
      message: 'Certificate revoked successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to revoke certificate', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════
 * USER MANAGEMENT ROUTES
 * ═══════════════════════════════════════════════════════════
 */

// POST /api/admin/users - Create user
router.post('/users', async (req, res) => {
  try {
    const result = await adminService.createUser(req.body);
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to create user', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/admin/users - List users
router.get('/users', async (req, res) => {
  try {
    const result = await adminService.listUsers(req.query);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to list users', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT /api/admin/users/:id - Update user
router.put('/users/:id', async (req, res) => {
  try {
    const result = await adminService.updateUser(req.params.id, req.body);
    res.json({
      success: true,
      message: 'User updated successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to update user', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const result = await adminService.deleteUser(req.params.id);
    res.json({
      success: true,
      message: 'User deleted successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to delete user', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════
 * AUTH PERMISSIONS & ROLES ROUTES
 * ═══════════════════════════════════════════════════════════
 */

// POST /api/admin/roles - Create role
router.post('/roles', async (req, res) => {
  try {
    const result = await adminService.createRole(req.body);
    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to create role', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/admin/roles - List roles
router.get('/roles', async (req, res) => {
  try {
    const result = await adminService.listRoles();
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to list roles', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/users/:userId/roles - Assign role to user
router.post('/users/:userId/roles', async (req, res) => {
  try {
    const result = await adminService.assignRoleToUser(req.params.userId, req.body.roleId);
    res.json({
      success: true,
      message: 'Role assigned to user successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to assign role', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════
 * MODERATION RULES ROUTES
 * ═══════════════════════════════════════════════════════════
 */

// POST /api/admin/moderation/rules - Create moderation rule
router.post('/moderation/rules', async (req, res) => {
  try {
    const result = await adminService.createModerationRule(req.body);
    res.status(201).json({
      success: true,
      message: 'Moderation rule created successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to create moderation rule', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/moderation/rules/defaults - Create default rules
router.post('/moderation/rules/defaults', async (req, res) => {
  try {
    const result = await adminService.createDefaultModerationRules();
    res.json({
      success: true,
      message: 'Default moderation rules created',
      data: result
    });
  } catch (error) {
    logger.error('Failed to create default moderation rules', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/admin/moderation/rules - List moderation rules
router.get('/moderation/rules', async (req, res) => {
  try {
    const result = await adminService.listModerationRules();
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to list moderation rules', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════
 * GROUPS ADMINISTRATION ROUTES
 * ═══════════════════════════════════════════════════════════
 */

// POST /api/admin/groups - Create group
router.post('/groups', async (req, res) => {
  try {
    const result = await adminService.createGroup(req.body);
    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to create group', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/admin/groups - List groups
router.get('/groups', async (req, res) => {
  try {
    const result = await adminService.listGroups(req.query);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to list groups', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT /api/admin/groups/:id - Update group
router.put('/groups/:id', async (req, res) => {
  try {
    const result = await adminService.updateGroup(req.params.id, req.body);
    res.json({
      success: true,
      message: 'Group updated successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to update group', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/admin/groups/:id - Delete group
router.delete('/groups/:id', async (req, res) => {
  try {
    const result = await adminService.deleteGroup(req.params.id);
    res.json({
      success: true,
      message: 'Group deleted successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to delete group', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════
 * SECRETS MANAGEMENT ROUTES
 * ═══════════════════════════════════════════════════════════
 */

// POST /api/admin/secrets - Create secret
router.post('/secrets', async (req, res) => {
  try {
    const result = await adminService.createSecret(req.body);
    res.status(201).json({
      success: true,
      message: 'Secret created successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to create secret', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/admin/secrets - List secrets
router.get('/secrets', async (req, res) => {
  try {
    const result = await adminService.listSecrets(req.query.path);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to list secrets', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/admin/secrets/:key - Get secret
router.get('/secrets/:key(*)', async (req, res) => {
  try {
    const result = await adminService.getSecret(req.params.key);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to get secret', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT /api/admin/secrets/:key - Update secret
router.put('/secrets/:key(*)', async (req, res) => {
  try {
    const result = await adminService.updateSecret(req.params.key, req.body.value);
    res.json({
      success: true,
      message: 'Secret updated successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to update secret', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/admin/secrets/:key - Delete secret
router.delete('/secrets/:key(*)', async (req, res) => {
  try {
    const result = await adminService.deleteSecret(req.params.key);
    res.json({
      success: true,
      message: 'Secret deleted successfully',
      data: result
    });
  } catch (error) {
    logger.error('Failed to delete secret', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════
 * SERVICE LIFECYCLE MANAGEMENT ROUTES
 * ═══════════════════════════════════════════════════════════
 */

// GET /api/admin/services/status - Get all service statuses
router.get('/services/status', async (req, res) => {
  try {
    const statuses = adminService.getAllServiceStatuses();
    res.json({
      success: true,
      data: statuses
    });
  } catch (error) {
    logger.error('Failed to get service statuses', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/admin/services/:serviceKey/status - Get service status
router.get('/services/:serviceKey/status', async (req, res) => {
  try {
    const status = adminService.getServiceStatus(req.params.serviceKey);
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Failed to get service status', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/services/:serviceKey/start - Start service
router.post('/services/:serviceKey/start', async (req, res) => {
  try {
    logger.info(`Starting service: ${req.params.serviceKey}`);
    const result = await adminService.startService(req.params.serviceKey);
    res.json({
      success: true,
      message: `Service ${req.params.serviceKey} started successfully`,
      data: result
    });
  } catch (error) {
    logger.error('Failed to start service', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/services/:serviceKey/stop - Stop service
router.post('/services/:serviceKey/stop', async (req, res) => {
  try {
    logger.info(`Stopping service: ${req.params.serviceKey}`);
    const result = await adminService.stopService(req.params.serviceKey);
    res.json({
      success: true,
      message: `Service ${req.params.serviceKey} stopped successfully`,
      data: result
    });
  } catch (error) {
    logger.error('Failed to stop service', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/services/:serviceKey/restart - Restart service
router.post('/services/:serviceKey/restart', async (req, res) => {
  try {
    logger.info(`Restarting service: ${req.params.serviceKey}`);
    const result = await adminService.restartService(req.params.serviceKey);
    res.json({
      success: true,
      message: `Service ${req.params.serviceKey} restarted successfully`,
      data: result
    });
  } catch (error) {
    logger.error('Failed to restart service', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/admin/services/:serviceKey/logs - Get service logs
router.get('/services/:serviceKey/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = adminService.getServiceLogs(req.params.serviceKey, limit);
    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    logger.error('Failed to get service logs', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════
 * SYSTEM INITIALIZATION ROUTES
 * ═══════════════════════════════════════════════════════════
 */

// POST /api/admin/system/setup - Complete system setup
router.post('/system/setup', async (req, res) => {
  try {
    logger.info('Complete system setup requested', { options: req.body });
    const result = await adminService.completeSystemSetup(req.body);
    res.json({
      success: true,
      message: 'System setup completed',
      data: result
    });
  } catch (error) {
    logger.error('System setup failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/system/database/create - Create databases
router.post('/system/database/create', async (req, res) => {
  try {
    logger.info('Database creation requested');
    const result = await adminService.createDatabases(req.body);
    res.json({
      success: true,
      message: 'Databases created successfully',
      data: result
    });
  } catch (error) {
    logger.error('Database creation failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/system/migrations/run - Run migrations
router.post('/system/migrations/run', async (req, res) => {
  try {
    logger.info('Migrations requested');
    const result = await adminService.runMigrations(req.body);
    res.json({
      success: true,
      message: 'Migrations completed successfully',
      data: result
    });
  } catch (error) {
    logger.error('Migrations failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/system/seed - Seed default data
router.post('/system/seed', async (req, res) => {
  try {
    logger.info('Data seeding requested');
    const result = await adminService.seedDefaultData(req.body);
    res.json({
      success: true,
      message: 'Data seeded successfully',
      data: result
    });
  } catch (error) {
    logger.error('Data seeding failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/system/preflight - Run preflight checks
router.post('/system/preflight', async (req, res) => {
  try {
    logger.info('Preflight checks requested');
    const result = await adminService.runPreflightChecks(req.body);
    res.json({
      success: true,
      message: 'Preflight checks completed',
      data: result
    });
  } catch (error) {
    logger.error('Preflight checks failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════
 * SYSTEM-WIDE OPERATIONS (LEGACY)
 * ═══════════════════════════════════════════════════════════
 */

// POST /api/admin/system/initialize - Initialize entire system (legacy)
router.post('/system/initialize', async (req, res) => {
  try {
    logger.info('System initialization requested (legacy endpoint)');
    const result = await adminService.initializeSystem();
    res.json({
      success: true,
      message: 'System initialized successfully',
      data: result
    });
  } catch (error) {
    logger.error('System initialization failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/admin/health - Admin health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Admin API is operational',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
