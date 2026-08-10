/**
 * Migration: Create Cards Table
 *
 * Cards are reusable components that can be used across multiple forms and applications.
 * Similar to React components or Power Apps components.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('cards', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'applications',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Application-specific card (null = global card)',
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'User ID of the card creator',
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Card category (e.g., "form-section", "widget", "template")',
      },
      card_type: {
        type: Sequelize.ENUM('form-section', 'widget', 'template', 'component'),
        allowNull: false,
        defaultValue: 'component',
      },
      controls: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Controls within the card',
      },
      exposed_properties: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Properties that can be customized when using the card',
      },
      inputs: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Input parameters',
      },
      outputs: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Output values',
      },
      events: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Card-level events',
      },
      html: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Custom HTML (if custom card)',
      },
      css: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Custom CSS',
      },
      javascript: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Custom JavaScript',
      },
      preview_image: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Preview image URL',
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: [],
      },
      visibility: {
        type: Sequelize.ENUM('private', 'public', 'organization'),
        allowNull: false,
        defaultValue: 'private',
      },
      version: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: '1.0.0',
      },
      published: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      downloads: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of times card has been used',
      },
      rating: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true,
        comment: 'Average user rating (0-5)',
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
    await queryInterface.addIndex('cards', ['application_id'], {
      name: 'cards_application_id_idx',
    });

    await queryInterface.addIndex('cards', ['owner_id'], {
      name: 'cards_owner_id_idx',
    });

    await queryInterface.addIndex('cards', ['card_type'], {
      name: 'cards_card_type_idx',
    });

    await queryInterface.addIndex('cards', ['visibility'], {
      name: 'cards_visibility_idx',
    });

    await queryInterface.addIndex('cards', ['category'], {
      name: 'cards_category_idx',
    });

    await queryInterface.addIndex('cards', ['published'], {
      name: 'cards_published_idx',
    });

    await queryInterface.addIndex('cards', ['tags'], {
      name: 'cards_tags_idx',
      using: 'GIN',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('cards');
  }
};
