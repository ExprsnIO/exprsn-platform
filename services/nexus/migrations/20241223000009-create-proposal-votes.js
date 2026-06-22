'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('proposal_votes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      proposal_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'proposals',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      vote: {
        type: Sequelize.ENUM('yes', 'no', 'abstain'),
        allowNull: false
      },
      weight: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 1.0
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      voted_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('proposal_votes', ['proposal_id']);
    await queryInterface.addIndex('proposal_votes', ['user_id']);
    await queryInterface.addIndex('proposal_votes', ['proposal_id', 'user_id'], { unique: true });
    await queryInterface.addIndex('proposal_votes', ['vote']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('proposal_votes');
  }
};
