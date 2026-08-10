/**
 * Migration: Create reports table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('reports', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      type: {
        type: Sequelize.ENUM('tabular', 'chart', 'mixed', 'custom'),
        allowNull: false,
        defaultValue: 'mixed'
      },
      definition: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      format: {
        type: Sequelize.ENUM('pdf', 'excel', 'csv', 'html', 'json'),
        allowNull: false,
        defaultValue: 'html'
      },
      page_size: {
        type: Sequelize.ENUM('letter', 'a4', 'legal', 'tabloid'),
        allowNull: true,
        defaultValue: 'letter'
      },
      orientation: {
        type: Sequelize.ENUM('portrait', 'landscape'),
        allowNull: true,
        defaultValue: 'portrait'
      },
      template: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      header_template: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      footer_template: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_public: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_template: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      execution_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      last_executed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      avg_execution_time: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      updated_by: {
        type: Sequelize.UUID,
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
    await queryInterface.addIndex('reports', ['category']);
    await queryInterface.addIndex('reports', ['type']);
    await queryInterface.addIndex('reports', ['is_public']);
    await queryInterface.addIndex('reports', ['is_template']);
    await queryInterface.addIndex('reports', ['created_by']);
    await queryInterface.addIndex('reports', ['execution_count']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('reports');
  }
};
