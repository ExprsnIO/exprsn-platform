/**
 * ═══════════════════════════════════════════════════════════
 * Migration: Create Rate Limit Violations Table
 * Track rate limit and spam violations
 * ═══════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create violation_severity enum
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE violation_severity AS ENUM (
          'low',
          'medium',
          'high',
          'critical'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create rate_limit_violations table
    await queryInterface.createTable('rate_limit_violations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      violation_type: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Type of violation: post_spam, comment_spam, api_abuse, etc.'
      },
      severity: {
        type: 'violation_severity',
        allowNull: false
      },
      endpoint: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'API endpoint or action that triggered violation'
      },
      request_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Number of requests in violation window'
      },
      limit_threshold: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Rate limit threshold that was exceeded'
      },
      window_seconds: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Time window in seconds'
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      details: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'Additional violation details'
      },
      action_taken: {
        type: 'moderation_action',
        allowNull: true
      },
      auto_resolved: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      resolved_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      detected_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create indexes
    await queryInterface.addIndex('rate_limit_violations', ['user_id']);
    await queryInterface.addIndex('rate_limit_violations', ['violation_type']);
    await queryInterface.addIndex('rate_limit_violations', ['severity']);
    await queryInterface.addIndex('rate_limit_violations', ['detected_at']);
    await queryInterface.addIndex('rate_limit_violations', ['auto_resolved']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('rate_limit_violations');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS violation_severity CASCADE');
  }
};
