'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('group_trending_stats', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      group_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: 'groups',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      score: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.0
      },
      views_24h: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      views_7d: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      views_30d: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      member_growth_24h: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      member_growth_7d: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      member_growth_30d: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      activity_score: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.0
      },
      engagement_rate: {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 0.0
      },
      last_calculated_at: {
        type: Sequelize.BIGINT,
        allowNull: false
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
    await queryInterface.addIndex('group_trending_stats', ['group_id'], { unique: true });
    await queryInterface.addIndex('group_trending_stats', ['score']);
    await queryInterface.addIndex('group_trending_stats', ['activity_score']);
    await queryInterface.addIndex('group_trending_stats', ['last_calculated_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('group_trending_stats');
  }
};
