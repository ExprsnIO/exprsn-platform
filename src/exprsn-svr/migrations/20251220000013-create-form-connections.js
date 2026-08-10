/**
 * Migration: Create Form Connections Table
 *
 * Junction table linking forms to data source connections.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('form_connections', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      form_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'forms',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      app_form_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'app_forms',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      data_source_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'data_sources',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      connection_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Name used in the form (e.g., "Customers", "Orders")',
      },
      operations: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {
          read: true,
          create: false,
          update: false,
          delete: false,
        },
      },
      filters: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Default filters for this connection',
      },
      config: {
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
    });

    // Add indexes
    await queryInterface.addIndex('form_connections', ['form_id'], {
      name: 'form_connections_form_id_idx',
    });

    await queryInterface.addIndex('form_connections', ['app_form_id'], {
      name: 'form_connections_app_form_id_idx',
    });

    await queryInterface.addIndex('form_connections', ['data_source_id'], {
      name: 'form_connections_data_source_id_idx',
    });

    // Check constraint: either form_id or app_form_id must be set
    await queryInterface.sequelize.query(`
      ALTER TABLE form_connections
      ADD CONSTRAINT form_connections_form_check
      CHECK (
        (form_id IS NOT NULL AND app_form_id IS NULL) OR
        (form_id IS NULL AND app_form_id IS NOT NULL)
      )
    `);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('form_connections');
  }
};
