/**
 * Migration: Create dashboard_items table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('dashboard_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      dashboard_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'dashboards',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      visualization_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'visualizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      position: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      show_title: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      show_border: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      background_color: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      is_locked: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
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
    await queryInterface.addIndex('dashboard_items', ['dashboard_id']);
    await queryInterface.addIndex('dashboard_items', ['visualization_id']);
    await queryInterface.addIndex('dashboard_items', ['dashboard_id', 'order']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('dashboard_items');
  }
};
