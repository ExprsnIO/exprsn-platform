/**
 * Migration: Create Business Rules Table
 *
 * Individual business rules that can be used standalone or within decision tables.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('business_rules', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'applications',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      decision_table_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'decision_tables',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Associated decision table (if part of one)',
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      rule_type: {
        type: Sequelize.ENUM('condition', 'validation', 'transformation', 'calculation'),
        allowNull: false,
        defaultValue: 'condition',
      },
      condition: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Rule condition expression',
      },
      action: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Action to take when rule matches',
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Rule priority (higher = evaluated first)',
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    // Add indexes
    await queryInterface.addIndex('business_rules', ['application_id'], {
      name: 'business_rules_application_id_idx',
    });

    await queryInterface.addIndex('business_rules', ['decision_table_id'], {
      name: 'business_rules_decision_table_id_idx',
    });

    await queryInterface.addIndex('business_rules', ['rule_type'], {
      name: 'business_rules_rule_type_idx',
    });

    await queryInterface.addIndex('business_rules', ['enabled'], {
      name: 'business_rules_enabled_idx',
    });

    await queryInterface.addIndex('business_rules', ['priority'], {
      name: 'business_rules_priority_idx',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('business_rules');
  }
};
