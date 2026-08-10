/**
 * ═══════════════════════════════════════════════════════════
 * Seeder: Default Configuration
 * Creates default system configuration
 * ═══════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const now = new Date();

    const configs = [
      // General settings
      {
        id: uuidv4(),
        key: 'service_name',
        value: JSON.stringify('Exprsn Moderator'),
        category: 'general',
        description: 'Service display name',
        is_sensitive: false,
        is_system: true,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        key: 'auto_moderation_enabled',
        value: JSON.stringify(true),
        category: 'general',
        description: 'Enable automatic content moderation',
        is_sensitive: false,
        is_system: false,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        key: 'manual_review_enabled',
        value: JSON.stringify(true),
        category: 'general',
        description: 'Enable manual review queue',
        is_sensitive: false,
        is_system: false,
        created_at: now,
        updated_at: now
      },

      // Threshold settings
      {
        id: uuidv4(),
        key: 'auto_approve_threshold',
        value: JSON.stringify(30),
        category: 'thresholds',
        description: 'Risk score threshold for automatic approval (0-100)',
        is_sensitive: false,
        is_system: false,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        key: 'manual_review_threshold',
        value: JSON.stringify(51),
        category: 'thresholds',
        description: 'Risk score threshold for manual review (0-100)',
        is_sensitive: false,
        is_system: false,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        key: 'auto_reject_threshold',
        value: JSON.stringify(91),
        category: 'thresholds',
        description: 'Risk score threshold for automatic rejection (0-100)',
        is_sensitive: false,
        is_system: false,
        created_at: now,
        updated_at: now
      },

      // Email settings
      {
        id: uuidv4(),
        key: 'email_notifications_enabled',
        value: JSON.stringify(true),
        category: 'email',
        description: 'Enable email notifications',
        is_sensitive: false,
        is_system: false,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        key: 'email_from_address',
        value: JSON.stringify('moderation@exprsn.io'),
        category: 'email',
        description: 'Email from address',
        is_sensitive: false,
        is_system: false,
        created_at: now,
        updated_at: now
      },

      // AI Provider settings
      {
        id: uuidv4(),
        key: 'default_ai_provider',
        value: JSON.stringify('claude'),
        category: 'ai_providers',
        description: 'Default AI provider for moderation',
        is_sensitive: false,
        is_system: false,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        key: 'ai_fallback_enabled',
        value: JSON.stringify(true),
        category: 'ai_providers',
        description: 'Enable fallback to alternate AI providers on failure',
        is_sensitive: false,
        is_system: false,
        created_at: now,
        updated_at: now
      },

      // Workflow settings
      {
        id: uuidv4(),
        key: 'workflow_integration_enabled',
        value: JSON.stringify(true),
        category: 'workflows',
        description: 'Enable workflow integration for moderation actions',
        is_sensitive: false,
        is_system: false,
        created_at: now,
        updated_at: now
      },

      // Rate limiting
      {
        id: uuidv4(),
        key: 'rate_limit_detection_enabled',
        value: JSON.stringify(true),
        category: 'rate_limiting',
        description: 'Enable rate limit violation detection',
        is_sensitive: false,
        is_system: false,
        created_at: now,
        updated_at: now
      },

      // Notifications
      {
        id: uuidv4(),
        key: 'realtime_notifications_enabled',
        value: JSON.stringify(true),
        category: 'notifications',
        description: 'Enable real-time Socket.IO notifications',
        is_sensitive: false,
        is_system: false,
        created_at: now,
        updated_at: now
      }
    ];

    await queryInterface.bulkInsert('moderator_config', configs);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('moderator_config', null, {});
  }
};
