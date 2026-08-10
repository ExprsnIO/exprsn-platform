/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create Groups Table
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('groups', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
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
      parent_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'groups',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      level: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      path: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      type: {
        type: Sequelize.ENUM('organization', 'department', 'team', 'project', 'custom'),
        defaultValue: 'custom',
        allowNull: false
      },
      visibility: {
        type: Sequelize.ENUM('public', 'private', 'hidden'),
        defaultValue: 'private',
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
      member_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      settings: {
        type: Sequelize.JSONB,
        defaultValue: {
          allowMemberInvites: false,
          requireApproval: true,
          maxMembers: null
        },
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
    await queryInterface.addIndex('groups', ['slug'], {
      name: 'groups_slug_idx',
      unique: true
    });

    await queryInterface.addIndex('groups', ['parent_id'], {
      name: 'groups_parent_id_idx'
    });

    await queryInterface.addIndex('groups', ['type'], {
      name: 'groups_type_idx'
    });

    await queryInterface.addIndex('groups', ['visibility'], {
      name: 'groups_visibility_idx'
    });

    await queryInterface.addIndex('groups', ['is_active'], {
      name: 'groups_is_active_idx'
    });

    await queryInterface.addIndex('groups', ['path'], {
      name: 'groups_path_idx',
      using: 'btree'
    });

    await queryInterface.addIndex('groups', ['created_at'], {
      name: 'groups_created_at_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('groups');
  }
};
