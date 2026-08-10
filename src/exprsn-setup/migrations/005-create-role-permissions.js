/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create Role Permissions Table
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('role_permissions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      role_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'roles',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      permission_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'permissions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      granted: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false
      },
      conditions: {
        type: Sequelize.JSONB,
        defaultValue: {},
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
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create indexes
    await queryInterface.addIndex('role_permissions', ['role_id', 'permission_id'], {
      name: 'role_permissions_role_permission_unique',
      unique: true
    });

    await queryInterface.addIndex('role_permissions', ['role_id'], {
      name: 'role_permissions_role_id_idx'
    });

    await queryInterface.addIndex('role_permissions', ['permission_id'], {
      name: 'role_permissions_permission_id_idx'
    });

    await queryInterface.addIndex('role_permissions', ['granted'], {
      name: 'role_permissions_granted_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('role_permissions');
  }
};
