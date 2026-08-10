/**
 * Entity Routes
 *
 * RESTful API endpoints for entity management.
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const EntityService = require('../services/EntityService');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Validation schemas
const createEntitySchema = Joi.object({
  name: Joi.string().min(1).max(255).required().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  displayName: Joi.string().min(1).max(255).required(),
  pluralName: Joi.string().max(255).allow('', null),
  description: Joi.string().max(10000).allow('', null),
  schema: Joi.object({
    fields: Joi.array().min(1).items(
      Joi.object({
        name: Joi.string().required(),
        type: Joi.string().required(),
        required: Joi.boolean(),
        unique: Joi.boolean(),
        defaultValue: Joi.any(),
        validation: Joi.object(),
      })
    ).required(),
  }).required(),
  relationships: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      type: Joi.string().valid('1:1', '1:N', 'N:1', 'N:M').required(),
      targetEntity: Joi.string().required(),
    })
  ),
  indexes: Joi.array(),
  permissions: Joi.object(),
  validationRules: Joi.array(),
  sourceType: Joi.string().valid('custom', 'forge', 'external').default('custom'),
  sourceConfig: Joi.object(),
  enableAudit: Joi.boolean().default(true),
  enableVersioning: Joi.boolean().default(false),
  softDelete: Joi.boolean().default(true),
});

const updateEntitySchema = Joi.object({
  name: Joi.string().min(1).max(255).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  displayName: Joi.string().min(1).max(255),
  pluralName: Joi.string().max(255).allow('', null),
  description: Joi.string().max(10000).allow('', null),
  schema: Joi.object(),
  relationships: Joi.array(),
  indexes: Joi.array(),
  permissions: Joi.object(),
  validationRules: Joi.array(),
  sourceType: Joi.string().valid('custom', 'forge', 'external'),
  sourceConfig: Joi.object(),
  enableAudit: Joi.boolean(),
  enableVersioning: Joi.boolean(),
  softDelete: Joi.boolean(),
});

const addFieldSchema = Joi.object({
  name: Joi.string().required().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  type: Joi.string().required(),
  required: Joi.boolean().default(false),
  unique: Joi.boolean().default(false),
  defaultValue: Joi.any(),
  validation: Joi.object(),
  description: Joi.string(),
});

const addRelationshipSchema = Joi.object({
  name: Joi.string().required(),
  type: Joi.string().valid('1:1', '1:N', 'N:1', 'N:M').required(),
  targetEntity: Joi.string().required(),
  foreignKey: Joi.string(),
  onDelete: Joi.string().valid('CASCADE', 'SET NULL', 'RESTRICT'),
  onUpdate: Joi.string().valid('CASCADE', 'SET NULL', 'RESTRICT'),
});

/**
 * @route   GET /lowcode/api/entities
 * @desc    List entities for an application
 * @access  Private
 */
router.get('/', asyncHandler(async (req, res) => {
  const { applicationId, sourceType, limit, offset, sortBy, sortOrder, search } = req.query;

  if (!applicationId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'applicationId is required',
    });
  }

  const result = await EntityService.listEntities(applicationId, {
    sourceType,
    limit: parseInt(limit) || 25,
    offset: parseInt(offset) || 0,
    sortBy: sortBy || 'created_at',
    sortOrder: sortOrder || 'DESC',
    search,
  });

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * @route   GET /lowcode/api/entities/:id
 * @desc    Get entity by ID
 * @access  Private
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const entity = await EntityService.getEntityById(id);

  res.json({
    success: true,
    data: entity,
  });
}));

/**
 * @route   POST /lowcode/api/entities
 * @desc    Create new entity
 * @access  Private
 */
router.post('/', asyncHandler(async (req, res) => {
  const { applicationId, ...entityData } = req.body;

  if (!applicationId) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'applicationId is required',
    });
  }

  const { error, value } = createEntitySchema.validate(entityData);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message,
    });
  }

  const userId = req.user?.id || req.body.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const entity = await EntityService.createEntity(applicationId, value, userId);

  res.status(201).json({
    success: true,
    data: entity,
    message: 'Entity created successfully',
  });
}));

/**
 * @route   PUT /lowcode/api/entities/:id
 * @desc    Update entity
 * @access  Private
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = updateEntitySchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message,
    });
  }

  const userId = req.user?.id || req.body.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const entity = await EntityService.updateEntity(id, value, userId);

  res.json({
    success: true,
    data: entity,
    message: 'Entity updated successfully',
  });
}));

/**
 * @route   DELETE /lowcode/api/entities/:id
 * @desc    Delete entity
 * @access  Private
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id || req.query.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const result = await EntityService.deleteEntity(id, userId);

  res.json({
    success: true,
    ...result,
  });
}));

/**
 * @route   POST /lowcode/api/entities/:id/fields
 * @desc    Add field to entity
 * @access  Private
 */
router.post('/:id/fields', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = addFieldSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message,
    });
  }

  const userId = req.user?.id || req.body.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const entity = await EntityService.addField(id, value, userId);

  res.json({
    success: true,
    data: entity,
    message: 'Field added successfully',
  });
}));

/**
 * @route   PUT /lowcode/api/entities/:id/fields/:fieldName
 * @desc    Update field in entity
 * @access  Private
 */
router.put('/:id/fields/:fieldName', asyncHandler(async (req, res) => {
  const { id, fieldName } = req.params;
  const userId = req.user?.id || req.body.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const entity = await EntityService.updateField(id, fieldName, req.body, userId);

  res.json({
    success: true,
    data: entity,
    message: 'Field updated successfully',
  });
}));

/**
 * @route   DELETE /lowcode/api/entities/:id/fields/:fieldName
 * @desc    Remove field from entity
 * @access  Private
 */
router.delete('/:id/fields/:fieldName', asyncHandler(async (req, res) => {
  const { id, fieldName } = req.params;
  const userId = req.user?.id || req.query.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const entity = await EntityService.removeField(id, fieldName, userId);

  res.json({
    success: true,
    data: entity,
    message: 'Field removed successfully',
  });
}));

/**
 * @route   POST /lowcode/api/entities/:id/relationships
 * @desc    Add relationship to entity
 * @access  Private
 */
router.post('/:id/relationships', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = addRelationshipSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message,
    });
  }

  const userId = req.user?.id || req.body.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const entity = await EntityService.addRelationship(id, value, userId);

  res.json({
    success: true,
    data: entity,
    message: 'Relationship added successfully',
  });
}));

/**
 * @route   GET /lowcode/api/entities/:id/crud-api
 * @desc    Generate CRUD API specification for entity
 * @access  Private
 */
router.get('/:id/crud-api', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const spec = await EntityService.generateCRUDAPI(id);

  res.json({
    success: true,
    data: spec,
  });
}));

/**
 * @route   POST /lowcode/api/entities/:id/migrations/generate
 * @desc    Generate migration SQL for entity
 * @access  Private
 */
router.post('/:id/migrations/generate', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { currentSchema, previousSchema, options } = req.body;

  const MigrationService = require('../services/MigrationService');

  // Generate migration
  const migration = await MigrationService.generateMigration(
    currentSchema,
    previousSchema,
    options
  );

  // Generate metadata
  const metadata = MigrationService.generateMigrationMetadata(
    currentSchema,
    migration,
    {
      version: options?.version,
      description: options?.description,
      type: migration.type
    }
  );

  res.json({
    success: true,
    data: {
      ...migration,
      metadata
    }
  });
}));

/**
 * @route   POST /lowcode/api/entities/:id/migrations/execute
 * @desc    Execute migration SQL against database
 * @access  Private
 */
router.post('/:id/migrations/execute', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { migration, options } = req.body;

  const { Pool } = require('pg');
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'exprsn_svr',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    // Validate schema if requested
    if (options?.validateSchema) {
      const MigrationService = require('../services/MigrationService');
      const validation = MigrationService.validateMigration(migration.sql || migration);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Migration validation failed',
          errors: validation.errors
        });
      }
    }

    // Backup table if requested
    if (options?.backupBeforeMigration) {
      const entity = await EntityService.getEntityById(id);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupTableName = `${entity.tableName}_backup_${timestamp}`;
      await pool.query(`CREATE TABLE ${backupTableName} AS SELECT * FROM ${entity.tableName}`);
    }

    // Execute migration SQL
    const sql = migration.sql || migration;
    await pool.query(sql);

    // Update entity status
    const userId = req.user?.id || req.body.userId;
    if (userId) {
      await EntityService.updateEntity(id, {
        status: 'published',
        publishedAt: new Date(),
        publishedBy: userId
      }, userId);
    }

    res.json({
      success: true,
      message: 'Migration executed successfully'
    });
  } catch (error) {
    console.error('Error executing migration:', error);
    res.status(500).json({
      success: false,
      error: 'MIGRATION_ERROR',
      message: error.message,
      details: error.stack
    });
  } finally {
    await pool.end();
  }
}));

/**
 * @route   POST /lowcode/api/entities/:id/crud/generate
 * @desc    Generate CRUD routes for entity
 * @access  Private
 */
router.post('/:id/crud/generate', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { entity } = req.body;

  const CRUDGenerator = require('../services/CRUDGenerator');

  // Generate CRUD routes
  const result = await CRUDGenerator.generateCRUDRoutes(entity);

  // Write route file
  const filePath = await CRUDGenerator.writeRouteFile(entity, result.routeCode);

  // Generate sample API call
  const sampleCall = CRUDGenerator.generateSampleCall(entity);

  res.json({
    success: true,
    data: {
      ...result,
      filePath,
      sampleCall
    }
  });
}));

module.exports = router;
