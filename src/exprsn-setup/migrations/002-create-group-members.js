/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create Group Members Table
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('group_members', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      group_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'groups',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      role: {
        type: Sequelize.ENUM('owner', 'admin', 'moderator', 'member', 'guest'),
        defaultValue: 'member',
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('active', 'pending', 'invited', 'suspended'),
        defaultValue: 'active',
        allowNull: false
      },
      permissions: {
        type: Sequelize.JSONB,
        defaultValue: {},
        allowNull: false
      },
      joined_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      invited_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      invited_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      approved_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
        allowNull: false
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
    await queryInterface.addIndex('group_members', ['group_id', 'user_id'], {
      name: 'group_members_group_user_unique',
      unique: true
    });

    await queryInterface.addIndex('group_members', ['group_id'], {
      name: 'group_members_group_id_idx'
    });

    await queryInterface.addIndex('group_members', ['user_id'], {
      name: 'group_members_user_id_idx'
    });

    await queryInterface.addIndex('group_members', ['role'], {
      name: 'group_members_role_idx'
    });

    await queryInterface.addIndex('group_members', ['status'], {
      name: 'group_members_status_idx'
    });

    await queryInterface.addIndex('group_members', ['joined_at'], {
      name: 'group_members_joined_at_idx'
    });

    await queryInterface.addIndex('group_members', ['expires_at'], {
      name: 'group_members_expires_at_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('group_members');
  }
};
