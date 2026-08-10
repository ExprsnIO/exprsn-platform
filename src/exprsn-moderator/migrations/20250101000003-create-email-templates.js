/**
 * ═══════════════════════════════════════════════════════════
 * Migration: Create Email Templates Table
 * Email templates for moderation notifications
 * ═══════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create template_type enum
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE template_type AS ENUM (
          'content_approved',
          'content_rejected',
          'content_flagged',
          'content_removed',
          'user_warned',
          'user_suspended',
          'user_banned',
          'appeal_received',
          'appeal_approved',
          'appeal_denied',
          'report_received',
          'report_resolved',
          'review_assigned',
          'custom'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create email_templates table
    await queryInterface.createTable('email_templates', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      type: {
        type: 'template_type',
        allowNull: false
      },
      subject: {
        type: Sequelize.STRING(500),
        allowNull: false,
        comment: 'Email subject line (supports {{variables}})'
      },
      body_text: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Plain text email body'
      },
      body_html: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'HTML email body'
      },
      variables: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Available template variables'
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create indexes
    await queryInterface.addIndex('email_templates', ['type']);
    await queryInterface.addIndex('email_templates', ['enabled']);
    await queryInterface.addIndex('email_templates', ['is_default']);

    // Create trigger for updated_at
    await queryInterface.sequelize.query(`
      CREATE TRIGGER update_email_templates_updated_at
      BEFORE UPDATE ON email_templates
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('email_templates');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS template_type CASCADE');
  }
};
