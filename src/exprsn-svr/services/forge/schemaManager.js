const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const {
  ForgeSchema,
  ForgeSchemaVersion,
  ForgeSchemaDependency,
  ForgeSchemaChange,
  sequelize
} = require('../models');
const logger = require('../../utils/logger');

/**
 * Schema Manager Service
 *
 * Handles CRUD operations for Forge schemas
 * Validates schema definitions against JSON Schema spec
 * Manages schema versioning and change tracking
 */

// Initialize AJV for JSON Schema validation
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Extended Forge Schema format definition
const FORGE_SCHEMA_FORMAT = {
  type: 'object',
  required: ['$schema', 'modelId', 'version', 'name', 'table', 'properties'],
  properties: {
    $schema: {
      type: 'string',
      const: 'https://exprsn.io/schemas/forge-model/v1'
    },
    modelId: {
      type: 'string',
      pattern: '^[a-zA-Z][a-zA-Z0-9_]*$'
    },
    version: {
      type: 'string',
      pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+$'
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 200
    },
    description: {
      type: 'string'
    },
    table: {
      type: 'string',
      pattern: '^[a-zA-Z][a-zA-Z0-9_]*$'
    },
    properties: {
      type: 'object',
      minProperties: 1,
      patternProperties: {
        '^[a-zA-Z][a-zA-Z0-9_]*$': {
          type: 'object',
          required: ['type'],
          properties: {
            type: {
              type: 'string',
              enum: ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null']
            },
            format: { type: 'string' },
            description: { type: 'string' },
            enum: { type: 'array' },
            default: {},
            database: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                length: { type: 'integer' },
                precision: { type: 'integer' },
                scale: { type: 'integer' },
                primaryKey: { type: 'boolean' },
                notNull: { type: 'boolean' },
                unique: { type: 'boolean' },
                index: { type: 'boolean' },
                default: {},
                check: { type: 'string' },
                foreignKey: {
                  type: 'object',
                  required: ['table', 'column'],
                  properties: {
                    table: { type: 'string' },
                    column: { type: 'string' },
                    onDelete: {
                      type: 'string',
                      enum: ['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION']
                    },
                    onUpdate: {
                      type: 'string',
                      enum: ['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION']
                    }
                  }
                }
              }
            },
            ui: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                widget: { type: 'string' },
                placeholder: { type: 'string' },
                helpText: { type: 'string' },
                hidden: { type: 'boolean' },
                readonly: { type: 'boolean' },
                order: { type: 'integer' }
              }
            },
            validation: {
              type: 'object',
              properties: {
                required: { type: 'boolean' },
                minLength: { type: 'integer' },
                maxLength: { type: 'integer' },
                minimum: { type: 'number' },
                maximum: { type: 'number' },
                pattern: { type: 'string' },
                customValidator: { type: 'string' }
              }
            },
            relationship: {
              type: 'object',
              required: ['model', 'type'],
              properties: {
                model: { type: 'string' },
                type: {
                  type: 'string',
                  enum: ['belongsTo', 'hasMany', 'hasOne', 'belongsToMany']
                },
                through: { type: 'string' }
              }
            }
          }
        }
      }
    },
    required: {
      type: 'array',
      items: { type: 'string' }
    },
    indexes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'columns'],
        properties: {
          name: { type: 'string' },
          columns: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1
          },
          unique: { type: 'boolean' },
          method: {
            type: 'string',
            enum: ['btree', 'hash', 'gist', 'gin', 'brin']
          }
        }
      }
    },
    workflows: {
      type: 'array',
      items: {
        type: 'object',
        required: ['event', 'workflowId'],
        properties: {
          event: {
            type: 'string',
            enum: ['onCreate', 'onUpdate', 'onDelete', 'onRead']
          },
          workflowId: { type: 'string' },
          condition: { type: 'string' },
          async: { type: 'boolean' }
        }
      }
    },
    permissions: {
      type: 'object',
      properties: {
        create: {
          type: 'array',
          items: { type: 'string' }
        },
        read: {
          type: 'array',
          items: { type: 'string' }
        },
        update: {
          type: 'array',
          items: { type: 'string' }
        },
        delete: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    },
    dependencies: {
      type: 'array',
      items: { type: 'string' }
    },
    seedData: {
      type: 'array',
      items: { type: 'object' }
    }
  }
};

const validateForgeSchema = ajv.compile(FORGE_SCHEMA_FORMAT);

class SchemaManagerService {
  /**
   * Create a new schema
   */
  async createSchema(schemaData, userId = null, metadata = {}) {
    try {
      // Validate schema definition
      const validation = this.validateSchemaDefinition(schemaData);
      if (!validation.valid) {
        throw new Error(`Invalid schema definition: ${validation.errors.join(', ')}`);
      }

      // Check if schema with same model_id and version already exists
      const existing = await ForgeSchema.findOne({
        where: {
          modelId: schemaData.modelId,
          version: schemaData.version
        }
      });

      if (existing) {
        throw new Error(`Schema ${schemaData.modelId} version ${schemaData.version} already exists`);
      }

      // Create schema
      const schema = await ForgeSchema.create({
        modelId: schemaData.modelId,
        version: schemaData.version,
        name: schemaData.name,
        description: schemaData.description || null,
        tableName: schemaData.table,
        schemaDefinition: schemaData,
        status: 'draft',
        isSystem: false,
        metadata: metadata,
        createdBy: userId
      });

      // Log the change
      await ForgeSchemaChange.logChange({
        schemaId: schema.id,
        changeType: 'created',
        changeDetails: {
          modelId: schema.modelId,
          version: schema.version,
          operation: 'create'
        },
        newState: schema.toJSON(),
        changedBy: userId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
      });

      // Create dependencies if specified
      if (schemaData.dependencies && schemaData.dependencies.length > 0) {
        await this.createDependencies(schema.id, schemaData, userId);
      }

      logger.info(`Schema created: ${schema.modelId} v${schema.version}`, {
        schemaId: schema.id,
        userId
      });

      return schema;
    } catch (error) {
      logger.error('Failed to create schema', { error: error.message, schemaData });
      throw error;
    }
  }

  /**
   * Get schema by ID
   */
  async getSchema(schemaId, includeRelations = false) {
    const includeOptions = includeRelations
      ? [
          { model: ForgeSchemaVersion, as: 'versions' },
          { model: ForgeSchemaDependency, as: 'dependencies' },
          { model: ForgeSchemaChange, as: 'changes', limit: 10, order: [['changedAt', 'DESC']] }
        ]
      : [];

    const schema = await ForgeSchema.findByPk(schemaId, {
      include: includeOptions
    });

    if (!schema) {
      throw new Error(`Schema not found: ${schemaId}`);
    }

    return schema;
  }

  /**
   * Get schema by model ID and version
   */
  async getSchemaByVersion(modelId, version) {
    const schema = await ForgeSchema.findOne({
      where: { modelId, version }
    });

    if (!schema) {
      throw new Error(`Schema not found: ${modelId} v${version}`);
    }

    return schema;
  }

  /**
   * Get latest version of a schema
   */
  async getLatestSchema(modelId) {
    const schema = await ForgeSchema.getLatestVersion(modelId);

    if (!schema) {
      throw new Error(`No active schema found for model: ${modelId}`);
    }

    return schema;
  }

  /**
   * List all schemas
   */
  async listSchemas(options = {}) {
    const {
      status = null,
      includeSystem = true,
      limit = 100,
      offset = 0,
      orderBy = 'modelId',
      orderDirection = 'ASC'
    } = options;

    const where = {};
    if (status) {
      where.status = status;
    }
    if (!includeSystem) {
      where.isSystem = false;
    }

    const schemas = await ForgeSchema.findAll({
      where,
      limit,
      offset,
      order: [[orderBy, orderDirection]]
    });

    const total = await ForgeSchema.count({ where });

    return {
      schemas,
      total,
      limit,
      offset
    };
  }

  /**
   * Update schema
   */
  async updateSchema(schemaId, updates, userId = null, metadata = {}) {
    const transaction = await sequelize.transaction();

    try {
      const schema = await ForgeSchema.findByPk(schemaId, { transaction });

      if (!schema) {
        throw new Error(`Schema not found: ${schemaId}`);
      }

      if (schema.isSystem) {
        throw new Error('Cannot update system schemas');
      }

      if (schema.status === 'active') {
        throw new Error('Cannot update active schema. Create a new version instead.');
      }

      const previousState = schema.toJSON();

      // Update schema definition if provided
      if (updates.schemaDefinition) {
        const validation = this.validateSchemaDefinition(updates.schemaDefinition);
        if (!validation.valid) {
          throw new Error(`Invalid schema definition: ${validation.errors.join(', ')}`);
        }

        schema.schemaDefinition = updates.schemaDefinition;
      }

      // Update other fields
      if (updates.name) schema.name = updates.name;
      if (updates.description !== undefined) schema.description = updates.description;
      if (updates.metadata) schema.metadata = { ...schema.metadata, ...updates.metadata };

      await schema.save({ transaction });

      // Log the change
      await ForgeSchemaChange.logChange({
        schemaId: schema.id,
        changeType: 'updated',
        changeDetails: {
          operation: 'update',
          updatedFields: Object.keys(updates)
        },
        previousState,
        newState: schema.toJSON(),
        changedBy: userId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
      });

      await transaction.commit();

      logger.info(`Schema updated: ${schema.modelId} v${schema.version}`, {
        schemaId: schema.id,
        userId
      });

      return schema;
    } catch (error) {
      await transaction.rollback();
      logger.error('Failed to update schema', { error: error.message, schemaId });
      throw error;
    }
  }

  /**
   * Activate a schema
   */
  async activateSchema(schemaId, userId = null, metadata = {}) {
    const transaction = await sequelize.transaction();

    try {
      const schema = await ForgeSchema.findByPk(schemaId, { transaction });

      if (!schema) {
        throw new Error(`Schema not found: ${schemaId}`);
      }

      if (schema.status === 'active') {
        throw new Error('Schema is already active');
      }

      const previousState = schema.toJSON();

      await schema.activate();

      // Log the change
      await ForgeSchemaChange.logChange({
        schemaId: schema.id,
        changeType: 'activated',
        changeDetails: {
          operation: 'activate',
          previousStatus: previousState.status
        },
        previousState,
        newState: schema.toJSON(),
        changedBy: userId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
      });

      await transaction.commit();

      logger.info(`Schema activated: ${schema.modelId} v${schema.version}`, {
        schemaId: schema.id,
        userId
      });

      return schema;
    } catch (error) {
      await transaction.rollback();
      logger.error('Failed to activate schema', { error: error.message, schemaId });
      throw error;
    }
  }

  /**
   * Deprecate a schema
   */
  async deprecateSchema(schemaId, reason = null, userId = null, metadata = {}) {
    const transaction = await sequelize.transaction();

    try {
      const schema = await ForgeSchema.findByPk(schemaId, { transaction });

      if (!schema) {
        throw new Error(`Schema not found: ${schemaId}`);
      }

      const previousState = schema.toJSON();

      await schema.deprecate();

      // Log the change
      await ForgeSchemaChange.logChange({
        schemaId: schema.id,
        changeType: 'deprecated',
        changeDetails: {
          operation: 'deprecate',
          reason: reason,
          previousStatus: previousState.status
        },
        previousState,
        newState: schema.toJSON(),
        changedBy: userId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
      });

      await transaction.commit();

      logger.info(`Schema deprecated: ${schema.modelId} v${schema.version}`, {
        schemaId: schema.id,
        reason,
        userId
      });

      return schema;
    } catch (error) {
      await transaction.rollback();
      logger.error('Failed to deprecate schema', { error: error.message, schemaId });
      throw error;
    }
  }

  /**
   * Delete a schema
   */
  async deleteSchema(schemaId, userId = null) {
    const transaction = await sequelize.transaction();

    try {
      const schema = await ForgeSchema.findByPk(schemaId, { transaction });

      if (!schema) {
        throw new Error(`Schema not found: ${schemaId}`);
      }

      if (schema.isSystem) {
        throw new Error('Cannot delete system schemas');
      }

      if (schema.status === 'active') {
        throw new Error('Cannot delete active schema. Deprecate it first.');
      }

      // Check if any schemas depend on this one
      const dependents = await ForgeSchemaDependency.findAll({
        where: { dependsOnSchemaId: schemaId },
        transaction
      });

      if (dependents.length > 0) {
        throw new Error(
          `Cannot delete schema: ${dependents.length} other schema(s) depend on it`
        );
      }

      await schema.destroy({ transaction });
      await transaction.commit();

      logger.info(`Schema deleted: ${schema.modelId} v${schema.version}`, {
        schemaId: schema.id,
        userId
      });

      return { success: true };
    } catch (error) {
      await transaction.rollback();
      logger.error('Failed to delete schema', { error: error.message, schemaId });
      throw error;
    }
  }

  /**
   * Create dependencies for a schema
   */
  async createDependencies(schemaId, schemaData, userId = null) {
    const dependencies = schemaData.dependencies || [];

    for (const depModelId of dependencies) {
      // Find the dependent schema
      const depSchema = await ForgeSchema.getLatestVersion(depModelId);

      // Extract dependency details from schema properties
      const depDetails = this.extractDependencyDetails(schemaData, depModelId);

      await ForgeSchemaDependency.create({
        schemaId: schemaId,
        dependsOnSchemaId: depSchema?.id || null,
        dependsOnModelId: depModelId,
        dependencyType: depDetails.type,
        fieldName: depDetails.fieldName,
        constraintConfig: depDetails.config
      });
    }
  }

  /**
   * Extract dependency details from schema definition
   */
  extractDependencyDetails(schemaData, dependencyModelId) {
    const properties = schemaData.properties || {};

    for (const [fieldName, fieldDef] of Object.entries(properties)) {
      // Check for foreign key
      if (fieldDef.database?.foreignKey?.table === dependencyModelId) {
        return {
          type: 'foreign_key',
          fieldName: fieldName,
          config: fieldDef.database.foreignKey
        };
      }

      // Check for relationship
      if (fieldDef.relationship?.model === dependencyModelId) {
        return {
          type: 'reference',
          fieldName: fieldName,
          config: fieldDef.relationship
        };
      }
    }

    // Default to reference type
    return {
      type: 'reference',
      fieldName: null,
      config: null
    };
  }

  /**
   * Validate schema definition against Forge schema format
   */
  validateSchemaDefinition(schemaData) {
    const valid = validateForgeSchema(schemaData);

    if (!valid) {
      return {
        valid: false,
        errors: validateForgeSchema.errors.map(
          (err) => `${err.instancePath} ${err.message}`
        )
      };
    }

    // Additional custom validations
    const customErrors = [];

    // Ensure at least one primary key
    const properties = schemaData.properties || {};
    const hasPrimaryKey = Object.values(properties).some(
      (prop) => prop.database?.primaryKey === true
    );

    if (!hasPrimaryKey) {
      customErrors.push('Schema must have at least one primary key field');
    }

    if (customErrors.length > 0) {
      return {
        valid: false,
        errors: customErrors
      };
    }

    return { valid: true, errors: [] };
  }
}

module.exports = new SchemaManagerService();
