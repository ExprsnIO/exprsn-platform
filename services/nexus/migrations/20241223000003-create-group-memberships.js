'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('group_memberships', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
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
      role: {
        type: Sequelize.STRING(50),
        defaultValue: 'member',
        allowNull: false
      },
      custom_role_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('active', 'suspended', 'banned', 'left'),
        defaultValue: 'active',
        allowNull: false
      },
      signature: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      invited_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      joined_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      left_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      suspended_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      suspended_until: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      suspended_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      }
    });

    // Add indexes
    await queryInterface.addIndex('group_memberships', ['user_id']);
    await queryInterface.addIndex('group_memberships', ['group_id']);
    await queryInterface.addIndex('group_memberships', ['user_id', 'group_id'], { unique: true });
    await queryInterface.addIndex('group_memberships', ['role']);
    await queryInterface.addIndex('group_memberships', ['status']);
    await queryInterface.addIndex('group_memberships', ['joined_at']);
    await queryInterface.addIndex('group_memberships', ['group_id', 'status']);
    await queryInterface.addIndex('group_memberships', ['user_id', 'status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('group_memberships');
  }
};
