/**
 * ═══════════════════════════════════════════════════════════
 * Relationship Service - Entity Relationship Management
 * Handles relationships between entities:
 * - One-to-One
 * - One-to-Many
 * - Many-to-One
 * - Many-to-Many
 * ═══════════════════════════════════════════════════════════
 */

const { Entity, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');

class RelationshipService {
  constructor() {
    this.relationshipTypes = {
      oneToOne: 'oneToOne',
      oneToMany: 'oneToMany',
      manyToOne: 'manyToOne',
      manyToMany: 'manyToMany'
    };
  }

  /**
   * Create a relationship between two entities
   */
  async createRelationship(sourceEntityId, relationshipData) {
    try {
      const sourceEntity = await Entity.findByPk(sourceEntityId);
      if (!sourceEntity) {
        return { success: false, error: 'Source entity not found' };
      }

      const targetEntity = await Entity.findByPk(relationshipData.targetEntityId);
      if (!targetEntity) {
        return { success: false, error: 'Target entity not found' };
      }

      // Validate relationship type
      if (!Object.values(this.relationshipTypes).includes(relationshipData.type)) {
        return { success: false, error: 'Invalid relationship type' };
      }

      // Build relationship definition
      const relationship = {
        id: this.generateRelationshipId(),
        name: relationshipData.name,
        displayName: relationshipData.displayName,
        type: relationshipData.type,
        targetEntityId: relationshipData.targetEntityId,
        targetEntity: targetEntity.name,
        foreignKey: relationshipData.foreignKey,
        cascadeDelete: relationshipData.cascadeDelete || false,
        required: relationshipData.required || false,
        displayField: relationshipData.displayField || 'id',
        orderBy: relationshipData.orderBy || null,
        filter: relationshipData.filter || null,
        metadata: relationshipData.metadata || {}
      };

      // Handle many-to-many specific config
      if (relationshipData.type === 'manyToMany') {
        relationship.junctionTable = relationshipData.junctionTable ||
          `${sourceEntity.name}_${targetEntity.name}`;
        relationship.sourceKey = relationshipData.sourceKey || `${sourceEntity.name}Id`;
        relationship.targetKey = relationshipData.targetKey || `${targetEntity.name}Id`;
      }

      // Add relationship to source entity
      sourceEntity.addRelationship(relationship);
      await sourceEntity.save();

      // For bidirectional relationships, add inverse relationship
      if (relationshipData.bidirectional) {
        await this.createInverseRelationship(
          sourceEntity,
          targetEntity,
          relationship,
          relationshipData
        );
      }

      return {
        success: true,
        relationship
      };
    } catch (error) {
      console.error('[Relationship] Error creating relationship:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create inverse relationship for bidirectional relationships
   */
  async createInverseRelationship(sourceEntity, targetEntity, relationship, config) {
    const inverseType = this.getInverseRelationshipType(relationship.type);

    const inverseRelationship = {
      id: this.generateRelationshipId(),
      name: config.inverseName || `${sourceEntity.name}s`,
      displayName: config.inverseDisplayName || sourceEntity.displayName,
      type: inverseType,
      targetEntityId: sourceEntity.id,
      targetEntity: sourceEntity.name,
      foreignKey: relationship.foreignKey,
      cascadeDelete: false, // Usually inverse doesn't cascade
      required: false,
      displayField: relationship.displayField,
      metadata: {
        isInverse: true,
        originalRelationshipId: relationship.id
      }
    };

    if (relationship.type === 'manyToMany') {
      inverseRelationship.junctionTable = relationship.junctionTable;
      inverseRelationship.sourceKey = relationship.targetKey;
      inverseRelationship.targetKey = relationship.sourceKey;
    }

    targetEntity.addRelationship(inverseRelationship);
    await targetEntity.save();
  }

  /**
   * Get inverse relationship type
   */
  getInverseRelationshipType(type) {
    const inverseMap = {
      oneToOne: 'oneToOne',
      oneToMany: 'manyToOne',
      manyToOne: 'oneToMany',
      manyToMany: 'manyToMany'
    };

    return inverseMap[type];
  }

  /**
   * Update relationship
   */
  async updateRelationship(entityId, relationshipId, updates) {
    try {
      const entity = await Entity.findByPk(entityId);
      if (!entity) {
        return { success: false, error: 'Entity not found' };
      }

      const relationships = entity.relationships || [];
      const relationshipIndex = relationships.findIndex(r => r.id === relationshipId);

      if (relationshipIndex === -1) {
        return { success: false, error: 'Relationship not found' };
      }

      // Update relationship
      relationships[relationshipIndex] = {
        ...relationships[relationshipIndex],
        ...updates
      };

      entity.relationships = relationships;
      entity.changed('relationships', true);
      await entity.save();

      return {
        success: true,
        relationship: relationships[relationshipIndex]
      };
    } catch (error) {
      console.error('[Relationship] Error updating relationship:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete relationship
   */
  async deleteRelationship(entityId, relationshipId) {
    try {
      const entity = await Entity.findByPk(entityId);
      if (!entity) {
        return { success: false, error: 'Entity not found' };
      }

      const relationships = entity.relationships || [];
      const relationship = relationships.find(r => r.id === relationshipId);

      if (!relationship) {
        return { success: false, error: 'Relationship not found' };
      }

      // Remove relationship
      entity.relationships = relationships.filter(r => r.id !== relationshipId);
      entity.changed('relationships', true);
      await entity.save();

      // If this relationship has an inverse, remove it too
      if (relationship.metadata && relationship.metadata.isInverse === false) {
        await this.deleteInverseRelationship(relationship);
      }

      return {
        success: true,
        message: 'Relationship deleted successfully'
      };
    } catch (error) {
      console.error('[Relationship] Error deleting relationship:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete inverse relationship
   */
  async deleteInverseRelationship(relationship) {
    try {
      const targetEntity = await Entity.findByPk(relationship.targetEntityId);
      if (!targetEntity) return;

      const relationships = targetEntity.relationships || [];
      targetEntity.relationships = relationships.filter(r =>
        r.metadata?.originalRelationshipId !== relationship.id
      );
      targetEntity.changed('relationships', true);
      await targetEntity.save();
    } catch (error) {
      console.error('[Relationship] Error deleting inverse relationship:', error);
    }
  }

  /**
   * Get all relationships for an entity
   */
  async getEntityRelationships(entityId) {
    try {
      const entity = await Entity.findByPk(entityId);
      if (!entity) {
        return { success: false, error: 'Entity not found' };
      }

      // Enrich relationships with target entity info
      const enrichedRelationships = await Promise.all(
        (entity.relationships || []).map(async (rel) => {
          const targetEntity = await Entity.findByPk(rel.targetEntityId);
          return {
            ...rel,
            targetEntityInfo: targetEntity ? {
              id: targetEntity.id,
              name: targetEntity.name,
              displayName: targetEntity.displayName,
              pluralName: targetEntity.pluralName
            } : null
          };
        })
      );

      return {
        success: true,
        relationships: enrichedRelationships
      };
    } catch (error) {
      console.error('[Relationship] Error getting relationships:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Load related data for a record
   */
  async loadRelatedData(entityId, recordId, relationshipName, options = {}) {
    try {
      const entity = await Entity.findByPk(entityId);
      if (!entity) {
        return { success: false, error: 'Entity not found' };
      }

      const relationship = entity.relationships?.find(r => r.name === relationshipName);
      if (!relationship) {
        return { success: false, error: 'Relationship not found' };
      }

      const targetEntity = await Entity.findByPk(relationship.targetEntityId);
      if (!targetEntity) {
        return { success: false, error: 'Target entity not found' };
      }

      // Build query based on relationship type
      let query;
      switch (relationship.type) {
        case 'oneToOne':
        case 'manyToOne':
          query = this.buildToOneQuery(entity, targetEntity, relationship, recordId);
          break;

        case 'oneToMany':
          query = this.buildToManyQuery(entity, targetEntity, relationship, recordId, options);
          break;

        case 'manyToMany':
          query = this.buildManyToManyQuery(entity, targetEntity, relationship, recordId, options);
          break;

        default:
          return { success: false, error: 'Unsupported relationship type' };
      }

      // Execute query
      const data = await this.executeRelationshipQuery(query, targetEntity);

      return {
        success: true,
        data,
        relationship
      };
    } catch (error) {
      console.error('[Relationship] Error loading related data:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Build query for to-one relationships
   */
  buildToOneQuery(sourceEntity, targetEntity, relationship, recordId) {
    return {
      table: targetEntity.tableName || `entity_${targetEntity.id}`,
      where: {
        id: recordId // Simplified - would need actual foreign key lookup
      },
      limit: 1
    };
  }

  /**
   * Build query for to-many relationships
   */
  buildToManyQuery(sourceEntity, targetEntity, relationship, recordId, options) {
    const query = {
      table: targetEntity.tableName || `entity_${targetEntity.id}`,
      where: {
        [relationship.foreignKey]: recordId
      }
    };

    // Apply filters
    if (relationship.filter) {
      query.where = { ...query.where, ...relationship.filter };
    }

    // Apply ordering
    if (relationship.orderBy) {
      query.orderBy = relationship.orderBy;
    }

    // Apply pagination
    if (options.limit) {
      query.limit = options.limit;
    }
    if (options.offset) {
      query.offset = options.offset;
    }

    return query;
  }

  /**
   * Build query for many-to-many relationships
   */
  buildManyToManyQuery(sourceEntity, targetEntity, relationship, recordId, options) {
    return {
      table: targetEntity.tableName || `entity_${targetEntity.id}`,
      join: {
        table: relationship.junctionTable,
        on: `${targetEntity.tableName}.id = ${relationship.junctionTable}.${relationship.targetKey}`
      },
      where: {
        [`${relationship.junctionTable}.${relationship.sourceKey}`]: recordId
      },
      orderBy: relationship.orderBy,
      limit: options.limit,
      offset: options.offset
    };
  }

  /**
   * Execute relationship query
   */
  async executeRelationshipQuery(query, targetEntity) {
    // This would use the actual database connection
    // For now, return placeholder
    console.log('[Relationship] Executing query:', query);
    return [];
  }

  /**
   * Associate records (many-to-many)
   */
  async associateRecords(entityId, recordId, relationshipName, targetRecordIds) {
    try {
      const entity = await Entity.findByPk(entityId);
      if (!entity) {
        return { success: false, error: 'Entity not found' };
      }

      const relationship = entity.relationships?.find(r => r.name === relationshipName);
      if (!relationship) {
        return { success: false, error: 'Relationship not found' };
      }

      if (relationship.type !== 'manyToMany') {
        return { success: false, error: 'Can only associate records in many-to-many relationships' };
      }

      // Insert into junction table
      const junctionRecords = targetRecordIds.map(targetId => ({
        [relationship.sourceKey]: recordId,
        [relationship.targetKey]: targetId,
        created_at: new Date(),
        updated_at: new Date()
      }));

      // Build bulk insert query
      const placeholders = junctionRecords.map(() => '(?, ?, ?, ?)').join(', ');
      const values = junctionRecords.flatMap(record => [
        record[relationship.sourceKey],
        record[relationship.targetKey],
        record.created_at,
        record.updated_at
      ]);

      const query = `
        INSERT INTO ${relationship.junctionTable}
        (${relationship.sourceKey}, ${relationship.targetKey}, created_at, updated_at)
        VALUES ${placeholders}
        ON CONFLICT (${relationship.sourceKey}, ${relationship.targetKey}) DO NOTHING
      `;

      await sequelize.query(query, {
        replacements: values,
        type: QueryTypes.INSERT
      });

      console.log('[Relationship] Associated records:', {
        junctionTable: relationship.junctionTable,
        count: targetRecordIds.length
      });

      return {
        success: true,
        message: `Associated ${targetRecordIds.length} records`
      };
    } catch (error) {
      console.error('[Relationship] Error associating records:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Dissociate records (many-to-many)
   */
  async dissociateRecords(entityId, recordId, relationshipName, targetRecordIds) {
    try {
      const entity = await Entity.findByPk(entityId);
      if (!entity) {
        return { success: false, error: 'Entity not found' };
      }

      const relationship = entity.relationships?.find(r => r.name === relationshipName);
      if (!relationship) {
        return { success: false, error: 'Relationship not found' };
      }

      if (relationship.type !== 'manyToMany') {
        return { success: false, error: 'Can only dissociate records in many-to-many relationships' };
      }

      // Delete from junction table
      const query = `
        DELETE FROM ${relationship.junctionTable}
        WHERE ${relationship.sourceKey} = ?
        AND ${relationship.targetKey} IN (${targetRecordIds.map(() => '?').join(', ')})
      `;

      const result = await sequelize.query(query, {
        replacements: [recordId, ...targetRecordIds],
        type: QueryTypes.DELETE
      });

      console.log('[Relationship] Dissociated records:', {
        junctionTable: relationship.junctionTable,
        sourceKey: relationship.sourceKey,
        recordId,
        targetKey: relationship.targetKey,
        count: targetRecordIds.length
      });

      return {
        success: true,
        message: `Dissociated ${targetRecordIds.length} records`
      };
    } catch (error) {
      console.error('[Relationship] Error dissociating records:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate relationship integrity
   */
  async validateRelationship(entityId, relationshipId) {
    try {
      const entity = await Entity.findByPk(entityId);
      if (!entity) {
        return { success: false, error: 'Entity not found' };
      }

      const relationship = entity.relationships?.find(r => r.id === relationshipId);
      if (!relationship) {
        return { success: false, error: 'Relationship not found' };
      }

      const issues = [];

      // Check target entity exists
      const targetEntity = await Entity.findByPk(relationship.targetEntityId);
      if (!targetEntity) {
        issues.push('Target entity does not exist');
      }

      // Check foreign key field exists
      if (relationship.foreignKey) {
        const hasField = entity.schema.fields.some(f => f.name === relationship.foreignKey);
        if (!hasField) {
          issues.push(`Foreign key field '${relationship.foreignKey}' not found in entity schema`);
        }
      }

      // Check junction table for many-to-many
      if (relationship.type === 'manyToMany') {
        try {
          const tableExists = await sequelize.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables
              WHERE table_schema = 'public'
              AND table_name = ?
            )
          `, {
            replacements: [relationship.junctionTable],
            type: QueryTypes.SELECT
          });

          if (!tableExists[0].exists) {
            issues.push(`Junction table '${relationship.junctionTable}' does not exist`);
          } else {
            // Validate junction table has required columns
            const columns = await sequelize.query(`
              SELECT column_name
              FROM information_schema.columns
              WHERE table_name = ?
            `, {
              replacements: [relationship.junctionTable],
              type: QueryTypes.SELECT
            });

            const columnNames = columns.map(c => c.column_name);
            if (!columnNames.includes(relationship.sourceKey)) {
              issues.push(`Junction table missing source key column '${relationship.sourceKey}'`);
            }
            if (!columnNames.includes(relationship.targetKey)) {
              issues.push(`Junction table missing target key column '${relationship.targetKey}'`);
            }
          }
        } catch (error) {
          issues.push(`Error validating junction table: ${error.message}`);
        }
      }

      return {
        success: issues.length === 0,
        valid: issues.length === 0,
        issues
      };
    } catch (error) {
      console.error('[Relationship] Error validating relationship:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate unique relationship ID
   */
  generateRelationshipId() {
    return `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = new RelationshipService();
