/**
 * Migration: Create dashboards table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('dashboards', {
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
      layout: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          type: 'grid',
          columns: 12,
          rowHeight: 100,
          margin: [10, 10],
          containerPadding: [10, 10]
        }
      },
      theme: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {
          primaryColor: '#007bff',
          backgroundColor: '#ffffff',
          textColor: '#212529',
          fontFamily: 'Arial, sans-serif'
        }
      },
      refresh_interval: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      is_realtime: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
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
      category: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      view_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      last_viewed_at: {
        type: Sequelize.DATE,
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
    await queryInterface.addIndex('dashboards', ['is_public']);
    await queryInterface.addIndex('dashboards', ['is_template']);
    await queryInterface.addIndex('dashboards', ['category']);
    await queryInterface.addIndex('dashboards', ['created_by']);
    await queryInterface.addIndex('dashboards', ['created_at']);
    await queryInterface.addIndex('dashboards', ['view_count']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('dashboards');
  }
};
