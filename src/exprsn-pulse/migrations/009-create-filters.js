/**
 * Migration: Create filters table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('filters', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      report_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'reports',
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
      field: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      operator: {
        type: Sequelize.ENUM(
          'equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with',
          'greater_than', 'greater_than_or_equal', 'less_than', 'less_than_or_equal',
          'between', 'not_between', 'in', 'not_in', 'is_null', 'is_not_null',
          'is_empty', 'is_not_empty', 'matches_regex', 'custom'
        ),
        allowNull: false
      },
      value: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      case_sensitive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      is_global: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
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
    await queryInterface.addIndex('filters', ['report_id']);
    await queryInterface.addIndex('filters', ['field']);
    await queryInterface.addIndex('filters', ['is_global']);
    await queryInterface.addIndex('filters', ['is_active']);
    await queryInterface.addIndex('filters', ['created_by']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('filters');
  }
};
