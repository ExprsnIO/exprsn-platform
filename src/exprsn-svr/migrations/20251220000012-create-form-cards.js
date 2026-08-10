/**
 * Migration: Create Form Cards Table
 *
 * Junction table linking forms to cards (reusable components).
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('form_cards', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      form_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'forms',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      app_form_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'app_forms',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      card_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'cards',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      instance_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Unique instance identifier in the form',
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Display order',
      },
      config: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Instance-specific configuration',
      },
      data_binding: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Data binding configuration for this instance',
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
    });

    // Add indexes
    await queryInterface.addIndex('form_cards', ['form_id'], {
      name: 'form_cards_form_id_idx',
    });

    await queryInterface.addIndex('form_cards', ['app_form_id'], {
      name: 'form_cards_app_form_id_idx',
    });

    await queryInterface.addIndex('form_cards', ['card_id'], {
      name: 'form_cards_card_id_idx',
    });

    await queryInterface.addIndex('form_cards', ['position'], {
      name: 'form_cards_position_idx',
    });

    // Check constraint: either form_id or app_form_id must be set
    await queryInterface.sequelize.query(`
      ALTER TABLE form_cards
      ADD CONSTRAINT form_cards_form_check
      CHECK (
        (form_id IS NOT NULL AND app_form_id IS NULL) OR
        (form_id IS NULL AND app_form_id IS NOT NULL)
      )
    `);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('form_cards');
  }
};
