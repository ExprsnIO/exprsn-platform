/**
 * Migration: Create shares table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('shares', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      resource_type: {
        type: Sequelize.ENUM('dashboard', 'report', 'visualization', 'query'),
        allowNull: false
      },
      resource_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      share_type: {
        type: Sequelize.ENUM('user', 'group', 'role', 'public'),
        allowNull: false
      },
      shared_with: {
        type: Sequelize.UUID,
        allowNull: true
      },
      permissions: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          view: true,
          edit: false,
          delete: false,
          share: false
        }
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      access_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      last_accessed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('shares', ['resource_type', 'resource_id']);
    await queryInterface.addIndex('shares', ['share_type']);
    await queryInterface.addIndex('shares', ['shared_with']);
    await queryInterface.addIndex('shares', ['is_active']);
    await queryInterface.addIndex('shares', ['expires_at']);
    await queryInterface.addIndex('shares', ['created_by']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('shares');
  }
};
