/**
 * Migration: Create App Grids Table
 *
 * Grids (subgrids) are data tables that can be embedded in forms.
 * Supports inline editing, bulk operations, and master-detail relationships.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('app_grids', {
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
      form_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'app_forms',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Associated form (if embedded in a form)',
      },
      entity_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Associated entity for data binding',
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
      grid_type: {
        type: Sequelize.ENUM('editable', 'readonly', 'master-detail'),
        allowNull: false,
        defaultValue: 'readonly',
      },
      columns: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Column definitions',
      },
      data_source: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Data source configuration',
      },
      filters: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Default filters',
      },
      sorting: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Default sorting',
      },
      actions: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Row actions (edit, delete, custom)',
      },
      bulk_actions: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Bulk actions (delete, export, etc.)',
      },
      pagination: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {
          enabled: true,
          pageSize: 25,
          pageSizeOptions: [10, 25, 50, 100],
        },
      },
      settings: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Grid settings (responsive, export, etc.)',
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
    await queryInterface.addIndex('app_grids', ['application_id'], {
      name: 'app_grids_application_id_idx',
    });

    await queryInterface.addIndex('app_grids', ['form_id'], {
      name: 'app_grids_form_id_idx',
    });

    await queryInterface.addIndex('app_grids', ['entity_id'], {
      name: 'app_grids_entity_id_idx',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('app_grids');
  }
};
