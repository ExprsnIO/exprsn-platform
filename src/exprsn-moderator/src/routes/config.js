/**
 * Configuration Management Routes
 * Provides endpoints for the Setup dashboard to manage Moderator configurations
 */

const express = require('express');
const router = express.Router();
const { ContentFlag, ModerationCase } = require('../models');
const { logger } = require('@exprsn/shared');

// Configuration stub - these values should be moved to environment variables
const config = {
  moderation: {
    autoModerate: true,
    flagThreshold: 3
  },
  ai: {
    provider: process.env.MODERATOR_AI_PROVIDER || 'Anthropic',
    model: process.env.MODERATOR_AI_MODEL || 'claude-3-sonnet-20240229',
    confidence: parseFloat(process.env.MODERATOR_AI_CONFIDENCE) || 0.7,
    enabled: process.env.MODERATOR_AI_ENABLED !== 'false'
  }
};

router.get('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;

  try {
    let data;

    switch (sectionId) {
      case 'moderation-rules':
        data = await getModerationRules();
        break;
      case 'moderation-ai':
        data = await getAIConfig();
        break;
      case 'moderation-queue':
        data = await getModerationQueue();
        break;
      default:
        return res.status(404).json({ success: false, error: 'Configuration section not found' });
    }

    res.json(data);
  } catch (error) {
    logger.error(`Error fetching config for ${sectionId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  const configData = req.body;

  try {
    let result;

    switch (sectionId) {
      case 'moderation-ai':
        result = await updateAIConfig(configData);
        break;
      default:
        return res.status(404).json({ success: false, error: 'Configuration section not found' });
    }

    res.json({ success: true, result });
  } catch (error) {
    logger.error(`Error updating config for ${sectionId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function getModerationRules() {
  return {
    title: 'Moderation Rules',
    description: 'Define content moderation rules and policies',
    actions: ['Create Rule', 'Import Rules'],
    fields: [
      { name: 'autoModerate', label: 'Auto-Moderate Content', type: 'checkbox', value: config.moderation?.autoModerate !== false },
      { name: 'flagThreshold', label: 'Auto-Flag Threshold', type: 'number', value: config.moderation?.flagThreshold || 3 }
    ]
  };
}

async function getAIConfig() {
  return {
    title: 'AI Configuration',
    description: 'Configure AI provider for content moderation',
    fields: [
      { name: 'provider', label: 'AI Provider', type: 'select', options: ['Anthropic', 'OpenAI', 'DeepSeek'], value: config.ai?.provider || 'Anthropic' },
      { name: 'apiKey', label: 'API Key', type: 'password', value: '' },
      { name: 'model', label: 'Model', type: 'text', value: config.ai?.model || 'claude-3-sonnet-20240229' },
      { name: 'confidence', label: 'Confidence Threshold', type: 'number', value: config.ai?.confidence || 0.7 },
      { name: 'enabled', label: 'Enable AI Moderation', type: 'checkbox', value: config.ai?.enabled !== false }
    ]
  };
}

async function getModerationQueue() {
  const pendingCases = await ModerationCase.findAll({ where: { status: 'pending' }, order: [['created_at', 'DESC']], limit: 50 });

  return {
    title: 'Review Queue',
    description: 'Content pending moderation review',
    table: {
      headers: ['Content Type', 'Flagged', 'Reason', 'Reporter', 'Actions'],
      rows: pendingCases.map(c => [
        c.content_type,
        new Date(c.created_at).toLocaleDateString(),
        c.reason || 'Auto-flagged',
        c.reporter_id || 'System',
        'Review | Approve | Reject'
      ])
    }
  };
}

async function updateAIConfig(configData) {
  logger.info('AI configuration updated:', configData);
  if (configData.provider) config.ai = { ...config.ai, provider: configData.provider };
  if (configData.model) config.ai = { ...config.ai, model: configData.model };
  if (configData.confidence) config.ai = { ...config.ai, confidence: parseFloat(configData.confidence) };
  return { message: 'AI configuration updated successfully', config: configData };
}

module.exports = router;
