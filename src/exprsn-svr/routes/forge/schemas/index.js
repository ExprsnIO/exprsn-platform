const express = require('express');
const router = express.Router();
const schemaManager = require('../../../services/forge/schemaManager');
const ddlGenerator = require('../../../services/forge/ddlGenerator');
const migrationGenerator = require('../../../services/forge/migrationGenerator');
const dependencyResolver = require('../../../services/forge/dependencyResolver');
const { ForgeSchema, ForgeMigration, ForgeSchemaChange, ForgeSchemaVersion } = require('../../../models/forge');
const { requireAuth } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

/**
 * Schema Management API Routes
 *
 * Provides REST endpoints for managing Forge schemas
 * Includes schema CRUD, DDL generation, migrations, and dependency management
 */

// ============================================================
// Schema CRUD Operations
// ============================================================

/**
 * GET /api/schemas
 * List all schemas with optional filtering
 */
router.get('/', async (req, res) => {
  try {
    const {
      status,
      includeSystem = 'true',
      limit = 100,
      offset = 0,
      orderBy = 'modelId',
      orderDirection = 'ASC'
    } = req.query;

    const result = await schemaManager.listSchemas({
      status,
      includeSystem: includeSystem === 'true',
      limit: parseInt(limit),
      offset: parseInt(offset),
      orderBy,
      orderDirection
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Failed to list schemas', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schemas/:id
 * Get schema by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { includeRelations = 'true' } = req.query;

    const schema = await schemaManager.getSchema(id, includeRelations === 'true');

    res.json({
      success: true,
      schema
    });
  } catch (error) {
    logger.error('Failed to get schema', { error: error.message, schemaId: req.params.id });
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schemas/model/:modelId/latest
 * Get latest version of a model
 */
router.get('/model/:modelId/latest', async (req, res) => {
  try {
    const { modelId } = req.params;

    const schema = await schemaManager.getLatestSchema(modelId);

    res.json({
      success: true,
      schema
    });
  } catch (error) {
    logger.error('Failed to get latest schema', { error: error.message, modelId: req.params.modelId });
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schemas/model/:modelId/version/:version
 * Get specific version of a model
 */
router.get('/model/:modelId/version/:version', async (req, res) => {
  try {
    const { modelId, version } = req.params;

    const schema = await schemaManager.getSchemaByVersion(modelId, version);

    res.json({
      success: true,
      schema
    });
  } catch (error) {
    logger.error('Failed to get schema by version', {
      error: error.message,
      modelId: req.params.modelId,
      version: req.params.version
    });
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/schemas
 * Create a new schema
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const schemaData = req.body;
    const userId = req.user?.id;
    const metadata = {
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    };

    const schema = await schemaManager.createSchema(schemaData, userId, metadata);

    res.status(201).json({
      success: true,
      schema
    });
  } catch (error) {
    logger.error('Failed to create schema', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/schemas/:id
 * Update a schema
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user?.id;
    const metadata = {
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    };

    const schema = await schemaManager.updateSchema(id, updates, userId, metadata);

    res.json({
      success: true,
      schema
    });
  } catch (error) {
    logger.error('Failed to update schema', { error: error.message, schemaId: req.params.id });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/schemas/:id
 * Delete a schema
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    await schemaManager.deleteSchema(id, userId);

    res.json({
      success: true,
      message: 'Schema deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete schema', { error: error.message, schemaId: req.params.id });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// Schema Status Management
// ============================================================

/**
 * POST /api/schemas/:id/activate
 * Activate a schema
 */
router.post('/:id/activate', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const metadata = {
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    };

    const schema = await schemaManager.activateSchema(id, userId, metadata);

    res.json({
      success: true,
      schema
    });
  } catch (error) {
    logger.error('Failed to activate schema', { error: error.message, schemaId: req.params.id });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/schemas/:id/deprecate
 * Deprecate a schema
 */
router.post('/:id/deprecate', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;
    const metadata = {
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    };

    const schema = await schemaManager.deprecateSchema(id, reason, userId, metadata);

    res.json({
      success: true,
      schema
    });
  } catch (error) {
    logger.error('Failed to deprecate schema', { error: error.message, schemaId: req.params.id });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// Schema Validation
// ============================================================

/**
 * POST /api/schemas/validate
 * Validate a schema definition
 */
router.post('/validate', async (req, res) => {
  try {
    const schemaData = req.body;

    const validation = schemaManager.validateSchemaDefinition(schemaData);

    res.json({
      success: true,
      validation
    });
  } catch (error) {
    logger.error('Failed to validate schema', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// DDL Generation
// ============================================================

/**
 * POST /api/schemas/:id/ddl
 * Generate DDL for a schema
 */
router.post('/:id/ddl', async (req, res) => {
  try {
    const { id } = req.params;
    const schema = await ForgeSchema.findByPk(id);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    const ddl = ddlGenerator.generateDDL(schema.schemaDefinition);

    res.json({
      success: true,
      ddl: ddl.sql,
      statements: ddl.statements
    });
  } catch (error) {
    logger.error('Failed to generate DDL', { error: error.message, schemaId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/schemas/:id/ddl/with-timestamps
 * Generate DDL with automatic timestamp columns
 */
router.post('/:id/ddl/with-timestamps', async (req, res) => {
  try {
    const { id } = req.params;
    const schema = await ForgeSchema.findByPk(id);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      });
    }

    const ddl = ddlGenerator.generateTableWithTimestamps(schema.schemaDefinition);

    res.json({
      success: true,
      ddl: ddl.sql,
      statements: ddl.statements
    });
  } catch (error) {
    logger.error('Failed to generate DDL with timestamps', {
      error: error.message,
      schemaId: req.params.id
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// Migration Management
// ============================================================

/**
 * POST /api/schemas/:id/migrations
 * Generate migration from one version to another
 */
router.post('/:id/migrations', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { fromSchemaId } = req.body;

    const migration = await migrationGenerator.generateMigration(fromSchemaId, id);

    res.status(201).json({
      success: true,
      migration
    });
  } catch (error) {
    logger.error('Failed to generate migration', { error: error.message, toSchemaId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schemas/:id/migrations
 * Get all migrations for a schema
 */
router.get('/:id/migrations', async (req, res) => {
  try {
    const { id } = req.params;

    const migrations = await ForgeMigration.getMigrationsForSchema(id);

    res.json({
      success: true,
      count: migrations.length,
      migrations
    });
  } catch (error) {
    logger.error('Failed to get migrations', { error: error.message, schemaId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/schemas/migrations/:migrationId/execute
 * Execute a migration
 */
router.post('/migrations/:migrationId/execute', requireAuth, async (req, res) => {
  try {
    const { migrationId } = req.params;
    const userId = req.user?.id;

    const migration = await ForgeMigration.findByPk(migrationId);

    if (!migration) {
      return res.status(404).json({
        success: false,
        error: 'Migration not found'
      });
    }

    const result = await migration.execute(userId);

    res.json({
      success: true,
      result,
      migration
    });
  } catch (error) {
    logger.error('Failed to execute migration', {
      error: error.message,
      migrationId: req.params.migrationId
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/schemas/migrations/:migrationId/rollback
 * Rollback a migration
 */
router.post('/migrations/:migrationId/rollback', requireAuth, async (req, res) => {
  try {
    const { migrationId } = req.params;
    const userId = req.user?.id;

    const migration = await ForgeMigration.findByPk(migrationId);

    if (!migration) {
      return res.status(404).json({
        success: false,
        error: 'Migration not found'
      });
    }

    const result = await migration.rollback(userId);

    res.json({
      success: true,
      result,
      migration
    });
  } catch (error) {
    logger.error('Failed to rollback migration', {
      error: error.message,
      migrationId: req.params.migrationId
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schemas/migrations/pending
 * Get all pending migrations
 */
router.get('/migrations/pending', async (req, res) => {
  try {
    const migrations = await ForgeMigration.getPendingMigrations();

    res.json({
      success: true,
      count: migrations.length,
      migrations
    });
  } catch (error) {
    logger.error('Failed to get pending migrations', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/schemas/migrations/execute-all
 * Execute all pending migrations
 */
router.post('/migrations/execute-all', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;

    const result = await ForgeMigration.executeAllPending(userId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Failed to execute all pending migrations', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// Dependency Management
// ============================================================

/**
 * GET /api/schemas/:id/dependencies
 * Get dependencies for a schema
 */
router.get('/:id/dependencies', async (req, res) => {
  try {
    const { id } = req.params;
    const { maxDepth = 10, includeDetails = 'true' } = req.query;

    const chain = await dependencyResolver.getDependencyChain(id, {
      maxDepth: parseInt(maxDepth),
      includeSchemaDetails: includeDetails === 'true'
    });

    res.json({
      success: true,
      dependencies: chain
    });
  } catch (error) {
    logger.error('Failed to get dependencies', { error: error.message, schemaId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schemas/:id/dependents
 * Get schemas that depend on this schema
 */
router.get('/:id/dependents', async (req, res) => {
  try {
    const { id } = req.params;
    const { recursive = 'false', maxDepth = 10 } = req.query;

    const dependents = await dependencyResolver.getDependentSchemas(id, {
      recursive: recursive === 'true',
      maxDepth: parseInt(maxDepth)
    });

    res.json({
      success: true,
      count: dependents.length,
      dependents
    });
  } catch (error) {
    logger.error('Failed to get dependents', { error: error.message, schemaId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schemas/:id/dependency-tree
 * Get dependency tree for a schema
 */
router.get('/:id/dependency-tree', async (req, res) => {
  try {
    const { id } = req.params;
    const { maxDepth = 10, direction = 'dependencies' } = req.query;

    const tree = await dependencyResolver.getDependencyTree(id, {
      maxDepth: parseInt(maxDepth),
      direction
    });

    res.json({
      success: true,
      tree
    });
  } catch (error) {
    logger.error('Failed to get dependency tree', { error: error.message, schemaId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schemas/:id/can-delete
 * Check if a schema can be safely deleted
 */
router.get('/:id/can-delete', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await dependencyResolver.canDeleteSchema(id);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Failed to check delete safety', { error: error.message, schemaId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/schemas/execution-order
 * Get topologically sorted execution order for schemas
 */
router.post('/execution-order', async (req, res) => {
  try {
    const { schemaIds } = req.body;

    if (!Array.isArray(schemaIds) || schemaIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'schemaIds array is required'
      });
    }

    const order = await dependencyResolver.getExecutionOrder(schemaIds);

    res.json({
      success: true,
      order
    });
  } catch (error) {
    logger.error('Failed to get execution order', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schemas/dependencies/validate
 * Validate entire dependency graph
 */
router.get('/dependencies/validate', async (req, res) => {
  try {
    const result = await dependencyResolver.validateDependencyGraph();

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Failed to validate dependency graph', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schemas/dependencies/statistics
 * Get dependency statistics
 */
router.get('/dependencies/statistics', async (req, res) => {
  try {
    const stats = await dependencyResolver.getDependencyStatistics();

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    logger.error('Failed to get dependency statistics', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// Change History
// ============================================================

/**
 * GET /api/schemas/:id/changes
 * Get change history for a schema
 */
router.get('/:id/changes', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0, changeType } = req.query;

    const changes = await ForgeSchemaChange.getChangesForSchema(id, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      changeType
    });

    res.json({
      success: true,
      count: changes.length,
      changes
    });
  } catch (error) {
    logger.error('Failed to get schema changes', { error: error.message, schemaId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schemas/changes/recent
 * Get recent changes across all schemas
 */
router.get('/changes/recent', async (req, res) => {
  try {
    const { limit = 100 } = req.query;

    const changes = await ForgeSchemaChange.getRecentChanges(parseInt(limit));

    res.json({
      success: true,
      count: changes.length,
      changes
    });
  } catch (error) {
    logger.error('Failed to get recent changes', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
