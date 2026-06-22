/**
 * ═══════════════════════════════════════════════════════════
 * Migration: Create AI Agents Table
 * Stores AI agent configurations for moderation tasks
 * ═══════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create ai_agent_type enum
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE ai_agent_type AS ENUM (
          'text_moderation',
          'image_moderation',
          'video_moderation',
          'spam_detection',
          'rate_limit_detection',
          'hate_speech_detection',
          'nsfw_detection',
          'violence_detection',
          'custom'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create ai_agent_status enum
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE ai_agent_status AS ENUM (
          'active',
          'inactive',
          'testing',
          'error'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create ai_agents table
    await queryInterface.createTable('ai_agents', {
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
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      type: {
        type: 'ai_agent_type',
        allowNull: false
      },
      status: {
        type: 'ai_agent_status',
        allowNull: false,
        defaultValue: 'active'
      },
      provider: {
        type: 'ai_provider',
        allowNull: false,
        comment: 'AI provider to use: claude, openai, deepseek, local'
      },
      model: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Specific model name to use'
      },
      prompt_template: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Prompt template for AI analysis'
      },
      config: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'Agent-specific configuration'
      },
      threshold_scores: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'Score thresholds for various risk categories'
      },
      applies_to: {
        type: Sequelize.ARRAY(Sequelize.TEXT),
        defaultValue: [],
        comment: 'Content types this agent handles'
      },
      priority: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: 'Execution priority (higher = runs first)'
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      auto_action: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'Whether agent can take automatic actions'
      },
      // Performance metrics
      total_executions: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      successful_executions: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      failed_executions: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      avg_execution_time_ms: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      last_execution_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      last_error: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      last_error_at: {
        type: Sequelize.BIGINT,
        allowNull: true
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
    await queryInterface.addIndex('ai_agents', ['type']);
    await queryInterface.addIndex('ai_agents', ['status']);
    await queryInterface.addIndex('ai_agents', ['enabled']);
    await queryInterface.addIndex('ai_agents', ['priority']);

    // Create trigger for updated_at
    await queryInterface.sequelize.query(`
      CREATE TRIGGER update_ai_agents_updated_at
      BEFORE UPDATE ON ai_agents
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('ai_agents');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS ai_agent_type CASCADE');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS ai_agent_status CASCADE');
  }
};
