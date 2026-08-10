/**
 * Migration: Create visualizations table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('visualizations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      dataset_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'datasets',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      type: {
        type: Sequelize.ENUM(
          'bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea', 'bubble', 'scatter',
          'area', 'stackedArea', 'heatmap', 'treemap', 'sunburst', 'sankey',
          'network', 'chord', 'calendar', 'geographic', 'table', 'pivot', 'metric', 'gauge'
        ),
        allowNull: false
      },
      renderer: {
        type: Sequelize.ENUM('chartjs', 'd3', 'custom'),
        allowNull: false,
        defaultValue: 'chartjs'
      },
      config: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      data_mapping: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      filters: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      aggregations: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      width: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      height: {
        type: Sequelize.INTEGER,
        allowNull: true
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
    await queryInterface.addIndex('visualizations', ['dataset_id']);
    await queryInterface.addIndex('visualizations', ['type']);
    await queryInterface.addIndex('visualizations', ['renderer']);
    await queryInterface.addIndex('visualizations', ['created_by']);
    await queryInterface.addIndex('visualizations', ['is_public']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('visualizations');
  }
};
