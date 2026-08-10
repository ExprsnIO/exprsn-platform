/**
 * Migration: Create datasets table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('datasets', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      query_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'queries',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      data: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      schema: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      row_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      column_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      size: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      execution_time: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      parameters: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      is_snapshot: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
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
    await queryInterface.addIndex('datasets', ['query_id']);
    await queryInterface.addIndex('datasets', ['expires_at']);
    await queryInterface.addIndex('datasets', ['is_snapshot']);
    await queryInterface.addIndex('datasets', ['created_by']);
    await queryInterface.addIndex('datasets', ['created_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('datasets');
  }
};
