/**
 * Migration: Create App Entities Table
 *
 * Entities represent data models within an application.
 * Similar to database tables, entities define the structure of data.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('app_entities', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'applications',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Entity name (e.g., "Customer", "Order")',
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      plural_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Plural form (e.g., "Customers")',
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      table_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Physical database table name (if persisted)',
      },
      schema: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: { fields: [] },
        comment: 'Entity schema definition (fields, types, validations)',
      },
      relationships: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Entity relationships (1:1, 1:N, N:M)',
      },
      indexes: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Index definitions for performance',
      },
      permissions: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Entity-level permissions',
      },
      validation_rules: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Validation rules for the entity',
      },
      source_type: {
        type: Sequelize.ENUM('custom', 'forge', 'external'),
        allowNull: false,
        defaultValue: 'custom',
        comment: 'Where the entity originates from',
      },
      source_config: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Configuration for external/forge entities',
      },
      enable_audit: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Enable audit logging for this entity',
      },
      enable_versioning: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Enable record versioning',
      },
      soft_delete: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Use soft deletes instead of hard deletes',
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    // Add indexes
    await queryInterface.addIndex('app_entities', ['application_id'], {
      name: 'app_entities_application_id_idx',
    });

    await queryInterface.addIndex('app_entities', ['name'], {
      name: 'app_entities_name_idx',
    });

    await queryInterface.addIndex('app_entities', ['source_type'], {
      name: 'app_entities_source_type_idx',
    });

    // Unique constraint: entity name within application
    await queryInterface.addIndex('app_entities', ['application_id', 'name'], {
      name: 'app_entities_app_name_unique',
      unique: true,
      where: {
        deleted_at: null,
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('app_entities');
  }
};
