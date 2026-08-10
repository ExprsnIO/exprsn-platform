/**
 * ═══════════════════════════════════════════════════════════
 * Migration: Create Email Logs Table
 * Track sent emails for audit trail
 * ═══════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create email_status enum
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE email_status AS ENUM (
          'sent',
          'failed',
          'queued',
          'bounced'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create email_logs table
    await queryInterface.createTable('email_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        primaryKey: true
      },
      template_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'email_templates',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      recipient: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      subject: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      status: {
        type: 'email_status',
        allowNull: false
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      moderation_item_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'moderation_items',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      user_action_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'user_actions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      sent_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create indexes
    await queryInterface.addIndex('email_logs', ['recipient']);
    await queryInterface.addIndex('email_logs', ['status']);
    await queryInterface.addIndex('email_logs', ['sent_at']);
    await queryInterface.addIndex('email_logs', ['template_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('email_logs');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS email_status CASCADE');
  }
};
