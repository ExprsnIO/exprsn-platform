/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create Permissions Table
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('permissions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      slug: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      category: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      service: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      action: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      resource: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      is_system: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
        allowNull: false
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create indexes
    await queryInterface.addIndex('permissions', ['name'], {
      name: 'permissions_name_idx',
      unique: true
    });

    await queryInterface.addIndex('permissions', ['slug'], {
      name: 'permissions_slug_idx',
      unique: true
    });

    await queryInterface.addIndex('permissions', ['category'], {
      name: 'permissions_category_idx'
    });

    await queryInterface.addIndex('permissions', ['service'], {
      name: 'permissions_service_idx'
    });

    await queryInterface.addIndex('permissions', ['action'], {
      name: 'permissions_action_idx'
    });

    await queryInterface.addIndex('permissions', ['is_system'], {
      name: 'permissions_is_system_idx'
    });

    await queryInterface.addIndex('permissions', ['is_active'], {
      name: 'permissions_is_active_idx'
    });

    await queryInterface.addIndex('permissions', ['created_at'], {
      name: 'permissions_created_at_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('permissions');
  }
};
