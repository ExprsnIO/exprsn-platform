'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('group_recommendations', {
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
      related_group_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'groups',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      reason: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      score: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.0
      },
      algorithm: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      created_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('group_recommendations', ['group_id']);
    await queryInterface.addIndex('group_recommendations', ['related_group_id']);
    await queryInterface.addIndex('group_recommendations', ['group_id', 'related_group_id'], { unique: true });
    await queryInterface.addIndex('group_recommendations', ['score']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('group_recommendations');
  }
};
