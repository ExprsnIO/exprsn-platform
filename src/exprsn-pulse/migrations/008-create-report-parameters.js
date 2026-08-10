/**
 * Migration: Create report_parameters table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('report_parameters', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      report_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'reports',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      label: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      type: {
        type: Sequelize.ENUM(
          'string', 'number', 'boolean', 'date', 'datetime',
          'select', 'multiselect', 'user', 'range'
        ),
        allowNull: false
      },
      data_type: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      default_value: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      required: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      options: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      options_query: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      validation: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      is_visible: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
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
    await queryInterface.addIndex('report_parameters', ['report_id']);
    await queryInterface.addIndex('report_parameters', ['report_id', 'order']);
    await queryInterface.addIndex('report_parameters', ['name']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('report_parameters');
  }
};
