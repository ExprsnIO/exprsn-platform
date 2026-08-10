/**
 * ═══════════════════════════════════════════════════════════════════════
 * Create Setup Dashboard Tables
 * ═══════════════════════════════════════════════════════════════════════
 * Creates tables for Phase 1 of the Admin Dashboard:
 * - setup_dashboard_cards: User's customizable dashboard card layout
 * ═══════════════════════════════════════════════════════════════════════
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create setup_dashboard_cards table
    await queryInterface.createTable('setup_dashboard_cards', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'User ID - null for default/anonymous layout'
      },
      card_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Type of card: system_health, recent_activity, alerts, etc.'
      },
      title: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Display title for the card'
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Order position for the card'
      },
      size: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: '1x1',
        comment: 'Card size: 1x1, 2x1, 2x2, etc.'
      },
      visible: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether the card is visible'
      },
      config: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'Card-specific configuration (refresh interval, limits, etc.)'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes
    await queryInterface.addIndex('setup_dashboard_cards', ['user_id'], {
      name: 'idx_setup_dashboard_cards_user_id'
    });

    await queryInterface.addIndex('setup_dashboard_cards', ['user_id', 'position'], {
      name: 'idx_setup_dashboard_cards_user_position'
    });

    // Add table comment
    await queryInterface.sequelize.query(`
      COMMENT ON TABLE setup_dashboard_cards IS 'Stores user customizable dashboard card layouts for the admin interface';
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Drop table
    await queryInterface.dropTable('setup_dashboard_cards');
  }
};
