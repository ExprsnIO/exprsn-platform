/**
 * Entity Service
 *
 * Business logic for entity management.
 * Handles data entity CRUD operations and schema management.
 */

const { Entity, Application } = require('../models');
const { Op } = require('sequelize');

class EntityService {
  /**
   * List entities for an application
   */
  async listEntities(applicationId, options = {}) {
    const {
      sourceType,
      limit = 25,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      search,
    } = options;

    const where = { applicationId };

    if (sourceType) {
      where.sourceType = sourceType;
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { displayName: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Entity.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
    });

    return {
      total: count,
      entities: rows,
      limit,
      offset,
      hasMore: offset + limit < count,
    };
  }

  /**
   * Get entity by ID
   */
  async getEntityById(id) {
    const entity = await Entity.findByPk(id, {
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName'],
        },
      ],
    });

    if (!entity) {
      throw new Error('Entity not found');
    }

    return entity;
  }

  /**
   * Create new entity
   */
  async createEntity(applicationId, data, userId) {
    const {
      name,
      displayName,
      pluralName,
      description,
      schema,
      relationships,
      indexes,
      permissions,
      validationRules,
      sourceType,
      sourceConfig,
      enableAudit,
      enableVersioning,
      softDelete,
    } = data;

    // Verify application exists and user has access
    const application = await Application.findByPk(applicationId);

    if (!application) {
      throw new Error('Application not found');
    }

    // Check authorization (allow in development mode for testing)
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isMockUser = userId && userId.startsWith('dev-user-');

    if (!isDevelopment && !isMockUser && application.ownerId !== userId) {
      throw new Error('Unauthorized: You do not own this application');
    }

    // In development with mock users, temporarily assign ownership
    if (isDevelopment && isMockUser && !application.ownerId) {
      application.ownerId = userId;
      await application.save();
      console.log(`[DEV] Assigned ownership of application ${applicationId} to ${userId}`);
    }

    // Check if entity name is unique within application
    const existing = await Entity.findOne({
      where: {
        applicationId,
        name,
      },
    });

    if (existing) {
      throw new Error(`Entity with name "${name}" already exists in this application`);
    }

    // Validate schema has fields
    if (!schema || !schema.fields || schema.fields.length === 0) {
      throw new Error('Entity schema must have at least one field');
    }

    const entity = await Entity.create({
      applicationId,
      name,
      displayName: displayName || name,
      pluralName,
      description,
      schema,
      relationships: relationships || [],
      indexes: indexes || [],
      permissions: permissions || {},
      validationRules: validationRules || [],
      sourceType: sourceType || 'custom',
      sourceConfig,
      enableAudit: enableAudit !== undefined ? enableAudit : true,
      enableVersioning: enableVersioning || false,
      softDelete: softDelete !== undefined ? softDelete : true,
    });

    return entity;
  }

  /**
   * Update entity
   */
  async updateEntity(id, data, userId) {
    const entity = await Entity.findByPk(id, {
      include: [
        {
          model: Application,
          as: 'application',
        },
      ],
    });

    if (!entity) {
      throw new Error('Entity not found');
    }

    // Check authorization (allow in development mode for testing)
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isMockUser = userId && userId.startsWith('dev-user-');

    if (!isDevelopment && !isMockUser && entity.application.ownerId !== userId) {
      throw new Error('Unauthorized: You do not own this application');
    }

    // Check if name is being changed and ensure uniqueness
    if (data.name && data.name !== entity.name) {
      const existing = await Entity.findOne({
        where: {
          applicationId: entity.applicationId,
          name: data.name,
          id: { [Op.ne]: id },
        },
      });

      if (existing) {
        throw new Error(`Entity with name "${data.name}" already exists in this application`);
      }
    }

    const updatedEntity = await entity.update({
      name: data.name,
      displayName: data.displayName,
      pluralName: data.pluralName,
      description: data.description,
      schema: data.schema,
      relationships: data.relationships,
      indexes: data.indexes,
      permissions: data.permissions,
      validationRules: data.validationRules,
      sourceType: data.sourceType,
      sourceConfig: data.sourceConfig,
      enableAudit: data.enableAudit,
      enableVersioning: data.enableVersioning,
      softDelete: data.softDelete,
    });

    return updatedEntity;
  }

  /**
   * Delete entity
   */
  async deleteEntity(id, userId) {
    const entity = await Entity.findByPk(id, {
      include: [
        {
          model: Application,
          as: 'application',
        },
      ],
    });

    if (!entity) {
      throw new Error('Entity not found');
    }

    if (entity.application.ownerId !== userId) {
      throw new Error('Unauthorized: You do not own this application');
    }

    await entity.destroy();

    return { success: true, message: 'Entity deleted successfully' };
  }

  /**
   * Add field to entity
   */
  async addField(entityId, fieldData, userId) {
    const entity = await Entity.findByPk(entityId, {
      include: [{ model: Application, as: 'application' }],
    });

    if (!entity) {
      throw new Error('Entity not found');
    }

    if (entity.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Validate field doesn't already exist
    const fieldExists = entity.schema.fields.find(f => f.name === fieldData.name);
    if (fieldExists) {
      throw new Error(`Field "${fieldData.name}" already exists`);
    }

    entity.addField(fieldData);
    await entity.save();

    return entity;
  }

  /**
   * Update field in entity
   */
  async updateField(entityId, fieldName, updates, userId) {
    const entity = await Entity.findByPk(entityId, {
      include: [{ model: Application, as: 'application' }],
    });

    if (!entity) {
      throw new Error('Entity not found');
    }

    if (entity.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    entity.updateField(fieldName, updates);
    await entity.save();

    return entity;
  }

  /**
   * Remove field from entity
   */
  async removeField(entityId, fieldName, userId) {
    const entity = await Entity.findByPk(entityId, {
      include: [{ model: Application, as: 'application' }],
    });

    if (!entity) {
      throw new Error('Entity not found');
    }

    if (entity.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    entity.removeField(fieldName);
    await entity.save();

    return entity;
  }

  /**
   * Add relationship to entity
   */
  async addRelationship(entityId, relationshipData, userId) {
    const entity = await Entity.findByPk(entityId, {
      include: [{ model: Application, as: 'application' }],
    });

    if (!entity) {
      throw new Error('Entity not found');
    }

    if (entity.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    entity.addRelationship(relationshipData);
    await entity.save();

    return entity;
  }

  /**
   * Generate CRUD API for entity (auto-generated endpoints)
   */
  async generateCRUDAPI(entityId) {
    const entity = await Entity.findByPk(entityId);

    if (!entity) {
      throw new Error('Entity not found');
    }

    // This would generate OpenAPI/Swagger spec and actual API routes
    // For now, return the specification
    const spec = {
      entityId: entity.id,
      entityName: entity.name,
      endpoints: [
        {
          method: 'GET',
          path: `/api/data/${entity.name}`,
          description: `List ${entity.pluralName || entity.name} records`,
        },
        {
          method: 'GET',
          path: `/api/data/${entity.name}/:id`,
          description: `Get single ${entity.displayName} record`,
        },
        {
          method: 'POST',
          path: `/api/data/${entity.name}`,
          description: `Create new ${entity.displayName} record`,
        },
        {
          method: 'PUT',
          path: `/api/data/${entity.name}/:id`,
          description: `Update ${entity.displayName} record`,
        },
        {
          method: 'DELETE',
          path: `/api/data/${entity.name}/:id`,
          description: `Delete ${entity.displayName} record`,
        },
      ],
      schema: entity.schema,
    };

    return spec;
  }
}

module.exports = new EntityService();
