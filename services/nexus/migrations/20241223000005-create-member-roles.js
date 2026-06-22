'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('member_roles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      membership_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'group_memberships',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      role_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'group_roles',
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
        type: Sequelize.BIGINT,
        allowNull: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      }
    });

    // Add indexes
    await queryInterface.addIndex('member_roles', ['membership_id']);
    await queryInterface.addIndex('member_roles', ['role_id']);
    await queryInterface.addIndex('member_roles', ['membership_id', 'role_id'], { unique: true });
    await queryInterface.addIndex('member_roles', ['is_active']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('member_roles');
  }
};
