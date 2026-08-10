/**
 * Migration: Create Form Autosave Table
 *
 * Creates a table to store autosave data for forms as a fallback when Redis/Socket.IO is unavailable.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('form_autosaves', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      form_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        comment: 'Reference to the form being autosaved'
      },
      form_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: 'Untitled Form'
      },
      schema: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      components: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: []
      },
      custom_functions: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      variables: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: []
      },
      timestamp: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment: 'Client-side timestamp when autosave was triggered'
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      user_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'User who triggered the autosave'
      },
      saved_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: 'Server-side timestamp when autosave was saved'
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
    await queryInterface.addIndex('form_autosaves', ['form_id'], {
      name: 'idx_form_autosaves_form_id',
      unique: true
    });

    await queryInterface.addIndex('form_autosaves', ['user_id'], {
      name: 'idx_form_autosaves_user_id'
    });

    await queryInterface.addIndex('form_autosaves', ['saved_at'], {
      name: 'idx_form_autosaves_saved_at'
    });

    console.log('✓ Created form_autosaves table with indexes');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('form_autosaves');
    console.log('✓ Dropped form_autosaves table');
  }
};
