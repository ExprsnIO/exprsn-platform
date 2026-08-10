/**
 * ═══════════════════════════════════════════════════════════
 * Visual Schema Designer Routes
 * Drag-and-drop database schema builder API
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const {
  SchemaDefinition,
  SchemaTable,
  SchemaColumn,
  SchemaRelationship,
  SchemaIndex,
  SchemaMaterializedView,
  SchemaChangeLog,
  SchemaMigration
} = require('../../models');

// ═══════════════════════════════════════════════════════════
// Schema Definitions CRUD
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/forge/schema-designer
 * List all visual schemas
 */
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};

    if (status) {
      where.status = status;
    }

    const schemas = await SchemaDefinition.findAll({
      where,
      include: [
        { model: SchemaTable, as: 'tables' },
        { model: SchemaRelationship, as: 'relationships' }
      ],
      order: [['updatedAt', 'DESC']]
    });

    res.json({
      success: true,
      data: schemas
    });
  } catch (error) {
    console.error('Error fetching schemas:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch schemas'
    });
  }
});

/**
 * GET /api/forge/schema-designer/:id
 * Get schema with full details including canvas positions
 */
router.get('/:id', async (req, res) => {
  try {
    const schema = await SchemaDefinition.findByPk(req.params.id, {
      include: [
        {
          model: SchemaTable,
          as: 'tables',
          include: [
            { model: SchemaColumn, as: 'columns' },
            { model: SchemaIndex, as: 'indexes' }
          ]
        },
        {
          model: SchemaRelationship,
          as: 'relationships',
          include: [
            { model: SchemaTable, as: 'sourceTable' },
            { model: SchemaTable, as: 'targetTable' },
            { model: SchemaColumn, as: 'sourceColumn' },
            { model: SchemaColumn, as: 'targetColumn' }
          ]
        },
        { model: SchemaMaterializedView, as: 'materializedViews' },
        { model: SchemaMigration, as: 'migrations' }
      ]
    });

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Schema not found'
      });
    }

    res.json({
      success: true,
      data: schema
    });
  } catch (error) {
    console.error('Error fetching schema:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch schema'
    });
  }
});

/**
 * POST /api/forge/schema-designer
 * Create new visual schema
 */
router.post('/', async (req, res) => {
  try {
    const { name, slug, description, databaseName, schemaName, metadata } = req.body;

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Name and slug are required'
      });
    }

    const schema = await SchemaDefinition.create({
      name,
      slug,
      description,
      databaseName,
      schemaName: schemaName || 'public',
      metadata: metadata || {},
      status: 'draft',
      createdBy: req.user?.id
    });

    // Log change
    await SchemaChangeLog.create({
      schemaId: schema.id,
      entityType: 'schema',
      entityId: schema.id,
      action: 'create',
      afterState: schema.toJSON(),
      changedBy: req.user?.id,
      changeDescription: `Schema "${name}" created`
    });

    res.status(201).json({
      success: true,
      data: schema
    });
  } catch (error) {
    console.error('Error creating schema:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * PUT /api/forge/schema-designer/:id
 * Update schema
 */
router.put('/:id', async (req, res) => {
  try {
    const schema = await SchemaDefinition.findByPk(req.params.id);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Schema not found'
      });
    }

    const beforeState = schema.toJSON();
    const { name, description, status, metadata } = req.body;

    await schema.update({
      name: name || schema.name,
      description: description !== undefined ? description : schema.description,
      status: status || schema.status,
      metadata: metadata || schema.metadata,
      updatedBy: req.user?.id
    });

    // Log change
    await SchemaChangeLog.create({
      schemaId: schema.id,
      entityType: 'schema',
      entityId: schema.id,
      action: 'update',
      beforeState,
      afterState: schema.toJSON(),
      changedBy: req.user?.id,
      changeDescription: `Schema "${schema.name}" updated`
    });

    res.json({
      success: true,
      data: schema
    });
  } catch (error) {
    console.error('Error updating schema:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/forge/schema-designer/:id
 * Delete schema (soft delete)
 */
router.delete('/:id', async (req, res) => {
  try {
    const schema = await SchemaDefinition.findByPk(req.params.id);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Schema not found'
      });
    }

    const beforeState = schema.toJSON();

    await schema.destroy(); // Soft delete with paranoid: true

    // Log change
    await SchemaChangeLog.create({
      schemaId: schema.id,
      entityType: 'schema',
      entityId: schema.id,
      action: 'delete',
      beforeState,
      changedBy: req.user?.id,
      changeDescription: `Schema "${schema.name}" deleted`
    });

    res.json({
      success: true,
      message: 'Schema deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting schema:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Tables Management (Visual Designer Nodes)
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/forge/schema-designer/:schemaId/tables
 * Add table to canvas
 */
router.post('/:schemaId/tables', async (req, res) => {
  try {
    const { name, displayName, description, tableType, positionX, positionY, color, icon } = req.body;

    if (!name || !displayName) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Name and display name are required'
      });
    }

    const table = await SchemaTable.create({
      schemaId: req.params.schemaId,
      name,
      displayName,
      description,
      tableType: tableType || 'table',
      positionX: positionX || 100,
      positionY: positionY || 100,
      color: color || '#3498db',
      icon: icon || 'table'
    });

    // Load with associations for return
    const tableWithAssociations = await SchemaTable.findByPk(table.id, {
      include: [
        { model: SchemaColumn, as: 'columns' },
        { model: SchemaIndex, as: 'indexes' }
      ]
    });

    // Log change
    await SchemaChangeLog.create({
      schemaId: req.params.schemaId,
      entityType: 'table',
      entityId: table.id,
      action: 'create',
      afterState: table.toJSON(),
      changedBy: req.user?.id,
      changeDescription: `Table "${displayName}" added to canvas`
    });

    res.status(201).json({
      success: true,
      data: tableWithAssociations
    });
  } catch (error) {
    console.error('Error creating table:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * PUT /api/forge/schema-designer/:schemaId/tables/:tableId
 * Update table (including position)
 */
router.put('/:schemaId/tables/:tableId', async (req, res) => {
  try {
    const table = await SchemaTable.findOne({
      where: {
        id: req.params.tableId,
        schemaId: req.params.schemaId
      }
    });

    if (!table) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Table not found'
      });
    }

    const beforeState = table.toJSON();
    await table.update(req.body);

    // Reload with associations
    const updated = await SchemaTable.findByPk(table.id, {
      include: [
        { model: SchemaColumn, as: 'columns' },
        { model: SchemaIndex, as: 'indexes' }
      ]
    });

    // Log change
    await SchemaChangeLog.create({
      schemaId: req.params.schemaId,
      entityType: 'table',
      entityId: table.id,
      action: 'update',
      beforeState,
      afterState: updated.toJSON(),
      changedBy: req.user?.id,
      changeDescription: `Table "${table.displayName}" updated`
    });

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error updating table:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/forge/schema-designer/:schemaId/tables/:tableId
 * Delete table from canvas
 */
router.delete('/:schemaId/tables/:tableId', async (req, res) => {
  try {
    const table = await SchemaTable.findOne({
      where: {
        id: req.params.tableId,
        schemaId: req.params.schemaId
      }
    });

    if (!table) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Table not found'
      });
    }

    const beforeState = table.toJSON();
    await table.destroy();

    // Log change
    await SchemaChangeLog.create({
      schemaId: req.params.schemaId,
      entityType: 'table',
      entityId: table.id,
      action: 'delete',
      beforeState,
      changedBy: req.user?.id,
      changeDescription: `Table "${table.displayName}" deleted`
    });

    res.json({
      success: true,
      message: 'Table deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Columns Management
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/forge/schema-designer/:schemaId/tables/:tableId/columns
 * Add column to table
 */
router.post('/:schemaId/tables/:tableId/columns', async (req, res) => {
  try {
    const {
      name,
      displayName,
      description,
      dataType,
      length,
      precision,
      scale,
      isPrimaryKey,
      isNullable,
      isUnique,
      defaultValue,
      metadata
    } = req.body;

    if (!name || !displayName || !dataType) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Name, display name, and data type are required'
      });
    }

    const column = await SchemaColumn.create({
      tableId: req.params.tableId,
      name,
      displayName,
      description,
      dataType,
      length,
      precision,
      scale,
      isPrimaryKey: isPrimaryKey || false,
      isNullable: isNullable !== undefined ? isNullable : true,
      isUnique: isUnique || false,
      defaultValue,
      metadata: metadata || {}
    });

    // Log change
    await SchemaChangeLog.create({
      schemaId: req.params.schemaId,
      entityType: 'column',
      entityId: column.id,
      action: 'create',
      afterState: column.toJSON(),
      changedBy: req.user?.id,
      changeDescription: `Column "${displayName}" added`
    });

    res.status(201).json({
      success: true,
      data: column
    });
  } catch (error) {
    console.error('Error creating column:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * PUT /api/forge/schema-designer/:schemaId/tables/:tableId/columns/:columnId
 * Update column
 */
router.put('/:schemaId/tables/:tableId/columns/:columnId', async (req, res) => {
  try {
    const column = await SchemaColumn.findOne({
      where: {
        id: req.params.columnId,
        tableId: req.params.tableId
      }
    });

    if (!column) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Column not found'
      });
    }

    const beforeState = column.toJSON();
    await column.update(req.body);

    // Log change
    await SchemaChangeLog.create({
      schemaId: req.params.schemaId,
      entityType: 'column',
      entityId: column.id,
      action: 'update',
      beforeState,
      afterState: column.toJSON(),
      changedBy: req.user?.id,
      changeDescription: `Column "${column.displayName}" updated`
    });

    res.json({
      success: true,
      data: column
    });
  } catch (error) {
    console.error('Error updating column:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/forge/schema-designer/:schemaId/tables/:tableId/columns/:columnId
 * Delete column
 */
router.delete('/:schemaId/tables/:tableId/columns/:columnId', async (req, res) => {
  try {
    const column = await SchemaColumn.findOne({
      where: {
        id: req.params.columnId,
        tableId: req.params.tableId
      }
    });

    if (!column) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Column not found'
      });
    }

    const beforeState = column.toJSON();
    await column.destroy();

    // Log change
    await SchemaChangeLog.create({
      schemaId: req.params.schemaId,
      entityType: 'column',
      entityId: column.id,
      action: 'delete',
      beforeState,
      changedBy: req.user?.id,
      changeDescription: `Column "${column.displayName}" deleted`
    });

    res.json({
      success: true,
      message: 'Column deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting column:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Relationships Management (Canvas Lines)
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/forge/schema-designer/:schemaId/relationships
 * Create relationship line between tables
 */
router.post('/:schemaId/relationships', async (req, res) => {
  try {
    const {
      name,
      sourceTableId,
      sourceColumnId,
      targetTableId,
      targetColumnId,
      relationshipType,
      onDelete,
      onUpdate,
      junctionTableId,
      displayLabel
    } = req.body;

    if (!sourceTableId || !sourceColumnId || !targetTableId || !targetColumnId || !relationshipType) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Source/target table, column, and relationship type are required'
      });
    }

    const relationship = await SchemaRelationship.create({
      schemaId: req.params.schemaId,
      name,
      sourceTableId,
      sourceColumnId,
      targetTableId,
      targetColumnId,
      relationshipType,
      onDelete: onDelete || 'CASCADE',
      onUpdate: onUpdate || 'CASCADE',
      junctionTableId,
      displayLabel
    });

    // Load with associations for return
    const relationshipWithDetails = await SchemaRelationship.findByPk(relationship.id, {
      include: [
        { model: SchemaTable, as: 'sourceTable' },
        { model: SchemaTable, as: 'targetTable' },
        { model: SchemaColumn, as: 'sourceColumn' },
        { model: SchemaColumn, as: 'targetColumn' }
      ]
    });

    // Log change
    await SchemaChangeLog.create({
      schemaId: req.params.schemaId,
      entityType: 'relationship',
      entityId: relationship.id,
      action: 'create',
      afterState: relationship.toJSON(),
      changedBy: req.user?.id,
      changeDescription: `Relationship created`
    });

    res.status(201).json({
      success: true,
      data: relationshipWithDetails
    });
  } catch (error) {
    console.error('Error creating relationship:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/forge/schema-designer/:schemaId/relationships/:relationshipId
 * Delete relationship line
 */
router.delete('/:schemaId/relationships/:relationshipId', async (req, res) => {
  try {
    const relationship = await SchemaRelationship.findOne({
      where: {
        id: req.params.relationshipId,
        schemaId: req.params.schemaId
      }
    });

    if (!relationship) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Relationship not found'
      });
    }

    const beforeState = relationship.toJSON();
    await relationship.destroy();

    // Log change
    await SchemaChangeLog.create({
      schemaId: req.params.schemaId,
      entityType: 'relationship',
      entityId: relationship.id,
      action: 'delete',
      beforeState,
      changedBy: req.user?.id,
      changeDescription: `Relationship deleted`
    });

    res.json({
      success: true,
      message: 'Relationship deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting relationship:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Code Generation
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/forge/schema-designer/:id/generate-migration
 * Generate database migration from visual schema
 */
router.post('/:id/generate-migration', async (req, res) => {
  try {
    const MigrationGenerator = require('../../services/schema/MigrationGenerator');

    const schema = await SchemaDefinition.findByPk(req.params.id, {
      include: [
        {
          model: SchemaTable,
          as: 'tables',
          include: [
            { model: SchemaColumn, as: 'columns' },
            { model: SchemaIndex, as: 'indexes' }
          ]
        },
        { model: SchemaRelationship, as: 'relationships' }
      ]
    });

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Schema not found'
      });
    }

    // Generate migration
    const migration = await MigrationGenerator.generateMigration(schema.toJSON(), {
      name: req.body.name,
      timestamp: req.body.timestamp
    });

    // Save to schema_migrations table
    const savedMigration = await SchemaMigration.create({
      schemaId: schema.id,
      version: req.body.version || '1.0.0',
      name: migration.fileName,
      upSql: migration.upSql,
      downSql: migration.downSql,
      status: 'pending'
    });

    res.json({
      success: true,
      data: {
        migration: savedMigration,
        fileName: migration.fileName,
        content: migration.content
      }
    });
  } catch (error) {
    console.error('Error generating migration:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/forge/schema-designer/:id/generate-models
 * Generate Sequelize model files
 */
router.post('/:id/generate-models', async (req, res) => {
  try {
    const ModelGenerator = require('../../services/schema/ModelGenerator');

    const schema = await SchemaDefinition.findByPk(req.params.id, {
      include: [
        {
          model: SchemaTable,
          as: 'tables',
          include: [{ model: SchemaColumn, as: 'columns' }]
        },
        { model: SchemaRelationship, as: 'relationships' }
      ]
    });

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Schema not found'
      });
    }

    // Generate all models
    const models = await ModelGenerator.generateAllModels(schema.toJSON());

    res.json({
      success: true,
      data: {
        models,
        count: models.length
      }
    });
  } catch (error) {
    console.error('Error generating models:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Indexes Management
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/forge/schema-designer/:schemaId/tables/:tableId/indexes
 * Create index for table
 */
router.post('/:schemaId/tables/:tableId/indexes', async (req, res) => {
  try {
    const {
      name,
      indexType,
      columns,
      isUnique,
      whereClause,
      includeColumns
    } = req.body;

    if (!name || !columns || columns.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Index name and columns are required'
      });
    }

    const index = await SchemaIndex.create({
      tableId: req.params.tableId,
      name,
      indexType: indexType || 'btree',
      columns,
      isUnique: isUnique || false,
      whereClause,
      includeColumns
    });

    // Log change
    await SchemaChangeLog.create({
      schemaId: req.params.schemaId,
      entityType: 'index',
      entityId: index.id,
      action: 'create',
      afterState: index.toJSON(),
      changedBy: req.user?.id,
      changeDescription: `Index "${name}" created`
    });

    res.status(201).json({
      success: true,
      data: index
    });
  } catch (error) {
    console.error('Error creating index:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/forge/schema-designer/:schemaId/tables/:tableId/indexes/:indexId
 * Delete index
 */
router.delete('/:schemaId/tables/:tableId/indexes/:indexId', async (req, res) => {
  try {
    const index = await SchemaIndex.findOne({
      where: {
        id: req.params.indexId,
        tableId: req.params.tableId
      }
    });

    if (!index) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Index not found'
      });
    }

    const beforeState = index.toJSON();
    await index.destroy();

    // Log change
    await SchemaChangeLog.create({
      schemaId: req.params.schemaId,
      entityType: 'index',
      entityId: index.id,
      action: 'delete',
      beforeState,
      changedBy: req.user?.id,
      changeDescription: `Index "${index.name}" deleted`
    });

    res.json({
      success: true,
      message: 'Index deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting index:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Materialized Views Management
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/forge/schema-designer/:schemaId/materialized-views
 * Create materialized view
 */
router.post('/:schemaId/materialized-views', async (req, res) => {
  try {
    const {
      name,
      displayName,
      description,
      querySql,
      refreshStrategy,
      refreshSchedule,
      withData
    } = req.body;

    if (!name || !querySql) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Name and SQL query are required'
      });
    }

    const materializedView = await SchemaMaterializedView.create({
      schemaId: req.params.schemaId,
      name,
      displayName,
      description,
      querySql,
      refreshStrategy: refreshStrategy || 'manual',
      refreshSchedule,
      withData: withData !== undefined ? withData : true
    });

    // Log change
    await SchemaChangeLog.create({
      schemaId: req.params.schemaId,
      entityType: 'materialized_view',
      entityId: materializedView.id,
      action: 'create',
      afterState: materializedView.toJSON(),
      changedBy: req.user?.id,
      changeDescription: `Materialized view "${name}" created`
    });

    res.status(201).json({
      success: true,
      data: materializedView
    });
  } catch (error) {
    console.error('Error creating materialized view:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * PUT /api/forge/schema-designer/:schemaId/materialized-views/:viewId
 * Update materialized view
 */
router.put('/:schemaId/materialized-views/:viewId', async (req, res) => {
  try {
    const view = await SchemaMaterializedView.findOne({
      where: {
        id: req.params.viewId,
        schemaId: req.params.schemaId
      }
    });

    if (!view) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Materialized view not found'
      });
    }

    const beforeState = view.toJSON();
    await view.update(req.body);

    // Log change
    await SchemaChangeLog.create({
      schemaId: req.params.schemaId,
      entityType: 'materialized_view',
      entityId: view.id,
      action: 'update',
      beforeState,
      afterState: view.toJSON(),
      changedBy: req.user?.id,
      changeDescription: `Materialized view "${view.name}" updated`
    });

    res.json({
      success: true,
      data: view
    });
  } catch (error) {
    console.error('Error updating materialized view:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/forge/schema-designer/:schemaId/materialized-views/:viewId
 * Delete materialized view
 */
router.delete('/:schemaId/materialized-views/:viewId', async (req, res) => {
  try {
    const view = await SchemaMaterializedView.findOne({
      where: {
        id: req.params.viewId,
        schemaId: req.params.schemaId
      }
    });

    if (!view) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Materialized view not found'
      });
    }

    const beforeState = view.toJSON();
    await view.destroy();

    // Log change
    await SchemaChangeLog.create({
      schemaId: req.params.schemaId,
      entityType: 'materialized_view',
      entityId: view.id,
      action: 'delete',
      beforeState,
      changedBy: req.user?.id,
      changeDescription: `Materialized view "${view.name}" deleted`
    });

    res.json({
      success: true,
      message: 'Materialized view deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting materialized view:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/forge/schema-designer/:schemaId/materialized-views/:viewId/refresh
 * Refresh materialized view (manual refresh)
 */
router.post('/:schemaId/materialized-views/:viewId/refresh', async (req, res) => {
  try {
    const view = await SchemaMaterializedView.findOne({
      where: {
        id: req.params.viewId,
        schemaId: req.params.schemaId
      }
    });

    if (!view) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Materialized view not found'
      });
    }

    // Update last refreshed timestamp
    await view.update({
      lastRefreshedAt: new Date()
    });

    res.json({
      success: true,
      data: view,
      message: 'Materialized view refreshed'
    });
  } catch (error) {
    console.error('Error refreshing materialized view:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/forge/schema-designer/:id/changelog
 * Get schema change history
 */
router.get('/:id/changelog', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const changeLogs = await SchemaChangeLog.findAndCountAll({
      where: { schemaId: req.params.id },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: changeLogs.rows,
      total: changeLogs.count
    });
  } catch (error) {
    console.error('Error fetching changelog:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
