'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('join_requests', {
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
      message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected', 'expired'),
        defaultValue: 'pending'
      },
      reviewed_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      reviewed_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      review_message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      expires_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      }
    });

    // Add indexes
    await queryInterface.addIndex('join_requests', ['group_id']);
    await queryInterface.addIndex('join_requests', ['user_id']);
    await queryInterface.addIndex('join_requests', ['group_id', 'user_id']);
    await queryInterface.addIndex('join_requests', ['status']);
    await queryInterface.addIndex('join_requests', ['group_id', 'status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('join_requests');
  }
};
