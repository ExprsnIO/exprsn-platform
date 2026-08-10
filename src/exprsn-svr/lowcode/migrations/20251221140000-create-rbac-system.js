/**
 * Migration: Create RBAC System Tables
 * Creates tables for Role-Based Access Control:
 * - app_roles: Role definitions
 * - app_permissions: Granular permissions for roles
 * - app_user_roles: User-role assignments
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create app_roles table
    await queryInterface.createTable('app_roles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'applications',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_system_role: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      permissions: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes for app_roles
    await queryInterface.addIndex('app_roles', ['application_id']);
    await queryInterface.addIndex('app_roles', ['name']);
    await queryInterface.addIndex('app_roles', ['is_system_role']);
    await queryInterface.addIndex('app_roles', ['application_id', 'name'], {
      unique: true,
      name: 'app_roles_application_name_unique',
      where: { deleted_at: null }
    });

    // Create app_permissions table
    await queryInterface.createTable('app_permissions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      role_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'app_roles',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      resource_type: {
        type: Sequelize.ENUM('application', 'form', 'entity', 'grid', 'card', 'datasource'),
        allowNull: false
      },
      resource_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      actions: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      conditions: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      field_permissions: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes for app_permissions
    await queryInterface.addIndex('app_permissions', ['role_id']);
    await queryInterface.addIndex('app_permissions', ['resource_type']);
    await queryInterface.addIndex('app_permissions', ['resource_id']);
    await queryInterface.addIndex('app_permissions', ['resource_type', 'resource_id']);

    // Create app_user_roles table
    await queryInterface.createTable('app_user_roles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'applications',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      role_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'app_roles',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      assigned_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      assigned_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes for app_user_roles
    await queryInterface.addIndex('app_user_roles', ['user_id']);
    await queryInterface.addIndex('app_user_roles', ['application_id']);
    await queryInterface.addIndex('app_user_roles', ['role_id']);
    await queryInterface.addIndex('app_user_roles', ['user_id', 'application_id']);
    await queryInterface.addIndex('app_user_roles', ['expires_at']);
    await queryInterface.addIndex('app_user_roles', ['user_id', 'application_id', 'role_id'], {
      unique: true,
      name: 'app_user_roles_unique',
      where: { deleted_at: null }
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order (due to foreign keys)
    await queryInterface.dropTable('app_user_roles');
    await queryInterface.dropTable('app_permissions');
    await queryInterface.dropTable('app_roles');
  }
};
