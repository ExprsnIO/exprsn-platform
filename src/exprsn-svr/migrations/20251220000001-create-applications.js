/**
 * Migration: Create Applications Table
 *
 * Applications are the top-level containers for low-code solutions.
 * Each application can contain entities, forms, processes, and other resources.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('applications', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
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
      version: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: '1.0.0',
      },
      status: {
        type: Sequelize.ENUM('draft', 'active', 'inactive', 'archived'),
        allowNull: false,
        defaultValue: 'draft',
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'User ID of the application owner',
      },
      icon: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Application icon URL or emoji',
      },
      color: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: '#0078D4',
        comment: 'Application theme color (hex)',
      },
      settings: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Application-level settings and configuration',
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional metadata (tags, categories, etc.)',
      },
      git_repository: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Git repository URL for version control',
      },
      git_branch: {
        type: Sequelize.STRING(255),
        allowNull: true,
        defaultValue: 'main',
      },
      published_version: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Currently published version number',
      },
      published_at: {
        type: Sequelize.DATE,
        allowNull: true,
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
        comment: 'Soft delete timestamp',
      },
    });

    // Add indexes
    await queryInterface.addIndex('applications', ['owner_id'], {
      name: 'applications_owner_id_idx',
    });

    await queryInterface.addIndex('applications', ['status'], {
      name: 'applications_status_idx',
    });

    await queryInterface.addIndex('applications', ['created_at'], {
      name: 'applications_created_at_idx',
    });

    await queryInterface.addIndex('applications', ['name'], {
      name: 'applications_name_idx',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('applications');
  }
};
