const express = require('express');
const router = express.Router();
const schemaService = require('../../services/forge/schemaService');
const migrationService = require('../../services/forge/migrationService');
const { ForgeSchemaChange } = require('../../models/forge');
const logger = require('../../utils/logger');

// Middleware (you'll implement these based on your auth system)
// const { requireAuth } = require('../../middleware/auth');
// const { validateRequest } = require('../../middleware/validation');

/**
 * @route   GET /api/schemas
 * @desc    List all schemas with filtering
 * @access  Public (add auth middleware as needed)
 */
router.get('/', async (req, res) => {
  try {
    const {
      status,
      modelId,
      isSystem,
      search,
      limit,
      offset,
      orderBy,
      orderDirection
    } = req.query;

    const result = await schemaService.listSchemas({
      status,
      modelId,
      isSystem: isSystem === 'true' ? true : isSystem === 'false' ? false : undefined,
      search,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      orderBy,
      orderDirection
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('GET /api/schemas failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/schemas/statistics
 * @desc    Get schema statistics
 * @access  Public
 */
router.get('/statistics', async (req, res) => {
  try {
    const stats = await schemaService.getStatistics();

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    logger.error('GET /api/schemas/statistics failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/schemas
 * @desc    Create a new schema
 * @access  Authenticated
 */
router.post('/', async (req, res) => {
  try {
    const {
      modelId,
      version,
      name,
      description,
      tableName,
      schemaDefinition,
      status,
      isSystem,
      metadata
    } = req.body;

    // Get user ID from auth (placeholder - implement based on your auth)
    const createdBy = req.user?.id || null;

    const schema = await schemaService.createSchema({
      modelId,
      version,
      name,
      description,
      tableName,
      schemaDefinition,
      status,
      isSystem,
      metadata,
      createdBy
    });

    res.status(201).json({
      success: true,
      schema
    });
  } catch (error) {
    logger.error('POST /api/schemas failed', {
      error: error.message,
      body: req.body
    });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/schemas/:id
 * @desc    Get schema by ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { includeRelations } = req.query;

    const schema = await schemaService.getSchemaById(id, includeRelations === 'true');

    res.json({
      success: true,
      schema
    });
  } catch (error) {
    logger.error('GET /api/schemas/:id failed', {
      id: req.params.id,
      error: error.message
    });
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/schemas/:id
 * @desc    Update a schema
 * @access  Authenticated
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedBy = req.user?.id || null;

    const schema = await schemaService.updateSchema(id, updates, updatedBy);

    res.json({
      success: true,
      schema
    });
  } catch (error) {
    logger.error('PUT /api/schemas/:id failed', {
      id: req.params.id,
      error: error.message
    });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/schemas/:id
 * @desc    Delete a schema
 * @access  Authenticated
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedBy = req.user?.id || null;

    const result = await schemaService.deleteSchema(id, deletedBy);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('DELETE /api/schemas/:id failed', {
      id: req.params.id,
      error: error.message
    });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/schemas/:id/activate
 * @desc    Activate a schema
 * @access  Authenticated
 */
router.post('/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;
    const activatedBy = req.user?.id || null;

    const schema = await schemaService.activateSchema(id, activatedBy);

    res.json({
      success: true,
      schema
    });
  } catch (error) {
    logger.error('POST /api/schemas/:id/activate failed', {
      id: req.params.id,
      error: error.message
    });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/schemas/:id/deprecate
 * @desc    Deprecate a schema
 * @access  Authenticated
 */
router.post('/:id/deprecate', async (req, res) => {
  try {
    const { id } = req.params;
    const deprecatedBy = req.user?.id || null;

    const schema = await schemaService.deprecateSchema(id, deprecatedBy);

    res.json({
      success: true,
      schema
    });
  } catch (error) {
    logger.error('POST /api/schemas/:id/deprecate failed', {
      id: req.params.id,
      error: error.message
    });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/schemas/validate
 * @desc    Validate a schema definition
 * @access  Public
 */
router.post('/validate', async (req, res) => {
  try {
    const { schemaDefinition } = req.body;

    if (!schemaDefinition) {
      return res.status(400).json({
        success: false,
        error: 'schemaDefinition is required'
      });
    }

    const validation = await schemaService.validateSchemaDefinition(schemaDefinition);

    res.json({
      success: true,
      validation
    });
  } catch (error) {
    logger.error('POST /api/schemas/validate failed', {
      error: error.message
    });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/schemas/:id/ddl
 * @desc    Generate DDL for a schema
 * @access  Public
 */
router.post('/:id/ddl', async (req, res) => {
  try {
    const { id } = req.params;

    const { ddl, schema } = await schemaService.generateDDL(id);

    res.json({
      success: true,
      ddl,
      schema: {
        id: schema.id,
        modelId: schema.modelId,
        version: schema.version,
        tableName: schema.tableName
      }
    });
  } catch (error) {
    logger.error('POST /api/schemas/:id/ddl failed', {
      id: req.params.id,
      error: error.message
    });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * MIGRATION ENDPOINTS
 */

/**
 * @route   GET /api/schemas/migrations
 * @desc    List migrations
 * @access  Public
 */
router.get('/migrations', async (req, res) => {
  try {
    const { status, schemaId, limit, offset } = req.query;

    const result = await migrationService.listMigrations({
      status,
      schemaId,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('GET /api/schemas/migrations failed', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/schemas/migrations/statistics
 * @desc    Get migration statistics
 * @access  Public
 */
router.get('/migrations/statistics', async (req, res) => {
  try {
    const stats = await migrationService.getStatistics();

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    logger.error('GET /api/schemas/migrations/statistics failed', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/schemas/migrations
 * @desc    Generate a migration
 * @access  Authenticated
 */
router.post('/migrations', async (req, res) => {
  try {
    const {
      fromSchemaId,
      toSchemaId,
      migrationName,
      description
    } = req.body;

    const createdBy = req.user?.id || null;

    const migration = await migrationService.generateMigration({
      fromSchemaId,
      toSchemaId,
      migrationName,
      description,
      createdBy
    });

    res.status(201).json({
      success: true,
      migration
    });
  } catch (error) {
    logger.error('POST /api/schemas/migrations failed', {
      error: error.message,
      body: req.body
    });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/schemas/migrations/:id
 * @desc    Get migration by ID
 * @access  Public
 */
router.get('/migrations/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const migration = await migrationService.getMigrationById(id);

    res.json({
      success: true,
      migration
    });
  } catch (error) {
    logger.error('GET /api/schemas/migrations/:id failed', {
      id: req.params.id,
      error: error.message
    });
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/schemas/migrations/:id/execute
 * @desc    Execute a migration
 * @access  Authenticated
 */
router.post('/migrations/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const executedBy = req.user?.id || null;

    const result = await migrationService.executeMigration(id, executedBy);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('POST /api/schemas/migrations/:id/execute failed', {
      id: req.params.id,
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/schemas/migrations/:id/rollback
 * @desc    Rollback a migration
 * @access  Authenticated
 */
router.post('/migrations/:id/rollback', async (req, res) => {
  try {
    const { id } = req.params;
    const rolledBackBy = req.user?.id || null;

    const result = await migrationService.rollbackMigration(id, rolledBackBy);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('POST /api/schemas/migrations/:id/rollback failed', {
      id: req.params.id,
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/schemas/migrations/execute-all
 * @desc    Execute all pending migrations
 * @access  Authenticated
 */
router.post('/migrations/execute-all', async (req, res) => {
  try {
    const executedBy = req.user?.id || null;

    const result = await migrationService.executeAllPending(executedBy);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('POST /api/schemas/migrations/execute-all failed', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * AUDIT/CHANGE LOG ENDPOINTS
 */

/**
 * @route   GET /api/schemas/changes/recent
 * @desc    Get recent schema changes
 * @access  Public
 */
router.get('/changes/recent', async (req, res) => {
  try {
    const { limit, offset } = req.query;

    const changes = await ForgeSchemaChange.getRecentChanges(
      limit ? parseInt(limit) : 100,
      offset ? parseInt(offset) : 0
    );

    res.json({
      success: true,
      changes
    });
  } catch (error) {
    logger.error('GET /api/schemas/changes/recent failed', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/schemas/:id/changes
 * @desc    Get change history for a schema
 * @access  Public
 */
router.get('/:id/changes', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit } = req.query;

    const changes = await ForgeSchemaChange.getSchemaHistory(
      id,
      limit ? parseInt(limit) : 50
    );

    res.json({
      success: true,
      changes
    });
  } catch (error) {
    logger.error('GET /api/schemas/:id/changes failed', {
      id: req.params.id,
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/schemas/changes/:id
 * @desc    Get specific change details
 * @access  Public
 */
router.get('/changes/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const change = await ForgeSchemaChange.findByPk(id, {
      include: [
        { model: require('../../models/forge').ForgeSchema, as: 'schema' },
        { model: require('../../models/forge').ForgeMigration, as: 'migration' }
      ]
    });

    if (!change) {
      return res.status(404).json({
        success: false,
        error: 'Change not found'
      });
    }

    res.json({
      success: true,
      change,
      diff: change.getDiff(),
      summary: change.getSummary()
    });
  } catch (error) {
    logger.error('GET /api/schemas/changes/:id failed', {
      id: req.params.id,
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/schemas/changes/statistics
 * @desc    Get change statistics
 * @access  Public
 */
router.get('/changes/statistics', async (req, res) => {
  try {
    const { days } = req.query;

    const stats = await ForgeSchemaChange.getStatistics(
      days ? parseInt(days) : 30
    );

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    logger.error('GET /api/schemas/changes/statistics failed', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
