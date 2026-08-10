/**
 * Migration: Create Processes Table
 *
 * BPM process definitions using BPMN 2.0 standard.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('processes', {
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
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Process category (e.g., "approval", "fulfillment")',
      },
      bpmn_definition: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'BPMN 2.0 XML definition',
      },
      definition: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Process definition in JSON format',
      },
      inputs: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Input parameters',
      },
      outputs: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Output parameters',
      },
      config: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {
          timeout: 604800000, // 7 days
          retryOnError: true,
          maxRetries: 3,
        },
      },
      triggers: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Process triggers (manual, automatic, webhook)',
      },
      status: {
        type: Sequelize.ENUM('draft', 'active', 'inactive', 'deprecated'),
        allowNull: false,
        defaultValue: 'draft',
      },
      version: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: '1.0.0',
      },
      published_version: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      published_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      instance_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total instances created',
      },
      active_instance_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Currently running instances',
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
    await queryInterface.addIndex('processes', ['application_id'], {
      name: 'processes_application_id_idx',
    });

    await queryInterface.addIndex('processes', ['status'], {
      name: 'processes_status_idx',
    });

    await queryInterface.addIndex('processes', ['category'], {
      name: 'processes_category_idx',
    });

    await queryInterface.addIndex('processes', ['name'], {
      name: 'processes_name_idx',
    });

    // Unique constraint: process name within application
    await queryInterface.addIndex('processes', ['application_id', 'name'], {
      name: 'processes_app_name_unique',
      unique: true,
      where: {
        deleted_at: null,
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('processes');
  }
};
