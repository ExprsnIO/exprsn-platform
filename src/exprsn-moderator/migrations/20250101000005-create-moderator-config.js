/**
 * ═══════════════════════════════════════════════════════════
 * Migration: Create Moderator Config Table
 * System-wide configuration settings
 * ═══════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create config_category enum
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE config_category AS ENUM (
          'general',
          'thresholds',
          'email',
          'ai_providers',
          'workflows',
          'rate_limiting',
          'notifications',
          'advanced'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create moderator_config table
    await queryInterface.createTable('moderator_config', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        primaryKey: true
      },
      key: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      value: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      category: {
        type: 'config_category',
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_sensitive: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'Whether this config contains sensitive data'
      },
      is_system: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'System config (not user-editable)'
      },
      updated_by: {
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
    await queryInterface.addIndex('moderator_config', ['category']);
    await queryInterface.addIndex('moderator_config', ['is_system']);

    // Create trigger for updated_at
    await queryInterface.sequelize.query(`
      CREATE TRIGGER update_moderator_config_updated_at
      BEFORE UPDATE ON moderator_config
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('moderator_config');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS config_category CASCADE');
  }
};
