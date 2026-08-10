/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create Roles Table
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('roles', {
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
      parent_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'roles',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      priority: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      scope: {
        type: Sequelize.ENUM('global', 'service', 'resource'),
        defaultValue: 'global',
        allowNull: false
      },
      scope_value: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
        allowNull: false
      },
      settings: {
        type: Sequelize.JSONB,
        defaultValue: {
          inheritsPermissions: true,
          allowMultipleAssignment: true,
          expirationDays: null
        },
        allowNull: false
      },
      user_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
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
    await queryInterface.addIndex('roles', ['name'], {
      name: 'roles_name_idx',
      unique: true
    });

    await queryInterface.addIndex('roles', ['slug'], {
      name: 'roles_slug_idx',
      unique: true
    });

    await queryInterface.addIndex('roles', ['parent_id'], {
      name: 'roles_parent_id_idx'
    });

    await queryInterface.addIndex('roles', ['is_system'], {
      name: 'roles_is_system_idx'
    });

    await queryInterface.addIndex('roles', ['is_active'], {
      name: 'roles_is_active_idx'
    });

    await queryInterface.addIndex('roles', ['scope'], {
      name: 'roles_scope_idx'
    });

    await queryInterface.addIndex('roles', ['priority'], {
      name: 'roles_priority_idx'
    });

    await queryInterface.addIndex('roles', ['created_at'], {
      name: 'roles_created_at_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('roles');
  }
};
