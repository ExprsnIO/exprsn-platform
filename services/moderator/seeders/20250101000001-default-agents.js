/**
 * ═══════════════════════════════════════════════════════════
 * Seeder: Default AI Agents
 * Creates default moderation agents
 * ═══════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const now = new Date();

    const agents = [
      {
        id: uuidv4(),
        name: 'Text Content Moderator',
        description: 'AI-powered text content moderation for posts, comments, and messages',
        type: 'text_moderation',
        status: 'active',
        provider: 'claude',
        model: 'claude-3-5-sonnet-20241022',
        prompt_template: null, // Will use default from agent
        config: JSON.stringify({
          autoApproveThreshold: 30,
          reviewThreshold: 75,
          rejectThreshold: 90,
          temperature: 0.3,
          maxTokens: 1000
        }),
        threshold_scores: JSON.stringify({
          toxicity: 75,
          hateSpeech: 70,
          violence: 80,
          nsfw: 75,
          spam: 60
        }),
        applies_to: ['text', 'post', 'comment', 'message'],
        priority: 100,
        enabled: true,
        auto_action: true,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        name: 'Image Content Moderator',
        description: 'AI-powered image moderation for detecting NSFW, violence, and hate symbols',
        type: 'image_moderation',
        status: 'active',
        provider: 'claude',
        model: 'claude-3-5-sonnet-20241022',
        prompt_template: null,
        config: JSON.stringify({
          autoApproveThreshold: 30,
          reviewThreshold: 75,
          rejectThreshold: 90,
          temperature: 0.3,
          maxTokens: 1000
        }),
        threshold_scores: JSON.stringify({
          nsfw: 70,
          violence: 80,
          hateSpeech: 75,
          disturbing: 75
        }),
        applies_to: ['image'],
        priority: 95,
        enabled: true,
        auto_action: true,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        name: 'Video Content Moderator',
        description: 'AI-powered video moderation analyzing metadata and thumbnails',
        type: 'video_moderation',
        status: 'active',
        provider: 'claude',
        model: 'claude-3-5-sonnet-20241022',
        prompt_template: null,
        config: JSON.stringify({
          autoApproveThreshold: 30,
          reviewThreshold: 75,
          rejectThreshold: 90
        }),
        threshold_scores: JSON.stringify({
          nsfw: 70,
          violence: 80,
          hateSpeech: 75,
          spam: 60
        }),
        applies_to: ['video'],
        priority: 90,
        enabled: true,
        auto_action: false, // Videos require manual review
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        name: 'Rate Limit & Spam Detector',
        description: 'Detects spam and abuse patterns through rate limiting analysis',
        type: 'rate_limit_detection',
        status: 'active',
        provider: 'local',
        model: null,
        prompt_template: null,
        config: JSON.stringify({
          limits: {
            posts_per_minute: 5,
            posts_per_hour: 50,
            comments_per_minute: 10,
            comments_per_hour: 100,
            messages_per_minute: 20,
            messages_per_hour: 200
          }
        }),
        threshold_scores: JSON.stringify({
          spam: 70,
          rateLimit: 75
        }),
        applies_to: ['post', 'comment', 'message'],
        priority: 85,
        enabled: true,
        auto_action: true,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        name: 'Hate Speech Specialist',
        description: 'Specialized agent for detecting hate speech and discriminatory content',
        type: 'hate_speech_detection',
        status: 'active',
        provider: 'openai',
        model: 'gpt-4-turbo-preview',
        prompt_template: null,
        config: JSON.stringify({
          autoApproveThreshold: 20,
          reviewThreshold: 60,
          rejectThreshold: 85,
          temperature: 0.2
        }),
        threshold_scores: JSON.stringify({
          hateSpeech: 60,
          toxicity: 70
        }),
        applies_to: ['text', 'post', 'comment', 'message'],
        priority: 80,
        enabled: false, // Disabled by default (optional enhanced check)
        auto_action: false,
        created_at: now,
        updated_at: now
      }
    ];

    await queryInterface.bulkInsert('ai_agents', agents);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('ai_agents', null, {});
  }
};
