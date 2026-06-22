'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('sub_group_memberships', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      sub_group_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'sub_groups',
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
        type: Sequelize.STRING(50),
        defaultValue: 'member',
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('active', 'suspended', 'left'),
        defaultValue: 'active',
        allowNull: false
      },
      joined_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      left_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      }
    });

    // Add indexes
    await queryInterface.addIndex('sub_group_memberships', ['sub_group_id']);
    await queryInterface.addIndex('sub_group_memberships', ['user_id']);
    await queryInterface.addIndex('sub_group_memberships', ['sub_group_id', 'user_id'], { unique: true });
    await queryInterface.addIndex('sub_group_memberships', ['status']);
    await queryInterface.addIndex('sub_group_memberships', ['sub_group_id', 'status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('sub_group_memberships');
  }
};
