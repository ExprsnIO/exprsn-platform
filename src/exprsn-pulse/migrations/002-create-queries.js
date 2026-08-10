/**
 * Migration: Create queries table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('queries', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      data_source_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'data_sources',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      query_type: {
        type: Sequelize.ENUM('sql', 'rest', 'jsonlex', 'custom'),
        allowNull: false,
        defaultValue: 'sql'
      },
      query_definition: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      parameters: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      refresh_interval: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      cache_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      cache_ttl: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 300
      },
      is_public: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      last_executed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      execution_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      avg_execution_time: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('queries', ['data_source_id']);
    await queryInterface.addIndex('queries', ['query_type']);
    await queryInterface.addIndex('queries', ['created_by']);
    await queryInterface.addIndex('queries', ['is_public']);
    await queryInterface.addIndex('queries', ['last_executed_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('queries');
  }
};
