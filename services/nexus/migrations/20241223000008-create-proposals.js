'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('proposals', {
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
      creator_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      proposal_type: {
        type: Sequelize.ENUM('rule-change', 'role-change', 'member-action', 'general'),
        allowNull: false
      },
      voting_method: {
        type: Sequelize.ENUM('simple-majority', 'supermajority', 'unanimous', 'weighted'),
        defaultValue: 'simple-majority'
      },
      quorum_required: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      voting_starts_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      voting_ends_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('draft', 'voting', 'passed', 'rejected', 'cancelled'),
        defaultValue: 'draft'
      },
      yes_votes: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      no_votes: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      abstain_votes: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      total_votes: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
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
    await queryInterface.addIndex('proposals', ['group_id']);
    await queryInterface.addIndex('proposals', ['creator_id']);
    await queryInterface.addIndex('proposals', ['status']);
    await queryInterface.addIndex('proposals', ['group_id', 'status']);
    await queryInterface.addIndex('proposals', ['voting_starts_at']);
    await queryInterface.addIndex('proposals', ['voting_ends_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('proposals');
  }
};
