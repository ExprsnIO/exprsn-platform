/**
 * Configuration Management Routes
 * Provides endpoints for the Setup dashboard to manage Spark (Messaging) configurations
 */

const express = require('express');
const router = express.Router();
const { Message, Conversation } = require('../models');
const { Op } = require('sequelize');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * GET /api/config/:sectionId
 * Fetch configuration for a specific section
 */
router.get('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;

  try {
    let data;

    switch (sectionId) {
      case 'messaging-settings':
        data = await getMessagingSettings();
        break;

      case 'messaging-moderation':
        data = await getMessagingModeration();
        break;

      default:
        return res.status(404).json({
          success: false,
          error: 'Configuration section not found'
        });
    }

    res.json(data);
  } catch (error) {
    logger.error(`Error fetching config for ${sectionId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/config/:sectionId
 * Update configuration for a specific section
 */
router.post('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  const configData = req.body;

  try {
    let result;

    switch (sectionId) {
      case 'messaging-settings':
        result = await updateMessagingSettings(configData);
        break;

      case 'messaging-moderation':
        result = await updateMessagingModeration(configData);
        break;

      default:
        return res.status(404).json({
          success: false,
          error: 'Configuration section not found'
        });
    }

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error(`Error updating config for ${sectionId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// Configuration Fetching Functions
// ========================================

async function getMessagingSettings() {
  // Get messaging statistics
  const totalMessages = await Message.count();
  const totalConversations = await Conversation.count();
  const todayMessages = await Message.count({
    where: {
      created_at: {
        [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
      }
    }
  });

  return {
    title: 'Messaging Settings',
    description: 'Configure messaging service settings',
    fields: [
      { name: 'maxMessageLength', label: 'Max Message Length', type: 'number', value: config.messaging?.maxMessageLength || 5000 },
      { name: 'enableE2EE', label: 'Enable End-to-End Encryption', type: 'checkbox', value: config.messaging?.enableE2EE !== false },
      { name: 'messageRetention', label: 'Message Retention (days)', type: 'number', value: config.messaging?.messageRetention || 365 },
      { name: 'fileUploadEnabled', label: 'Enable File Uploads', type: 'checkbox', value: config.messaging?.fileUploadEnabled !== false },
      { name: 'maxFileSize', label: 'Max File Size (MB)', type: 'number', value: config.messaging?.maxFileSize || 10 },
      { name: 'enableTypingIndicators', label: 'Enable Typing Indicators', type: 'checkbox', value: config.messaging?.enableTypingIndicators !== false },
      { name: 'enableReadReceipts', label: 'Enable Read Receipts', type: 'checkbox', value: config.messaging?.enableReadReceipts !== false }
    ],
    stats: {
      totalMessages,
      totalConversations,
      todayMessages
    }
  };
}

async function getMessagingModeration() {
  return {
    title: 'Messaging Moderation',
    description: 'Configure content moderation for messaging',
    fields: [
      { name: 'autoModeration', label: 'Auto-Moderation', type: 'checkbox', value: config.moderation?.enabled !== false },
      { name: 'profanityFilter', label: 'Profanity Filter', type: 'checkbox', value: config.moderation?.profanityFilter !== false },
      { name: 'spamDetection', label: 'Spam Detection', type: 'checkbox', value: config.moderation?.spamDetection !== false },
      { name: 'linkValidation', label: 'Link Validation', type: 'checkbox', value: config.moderation?.linkValidation !== false },
      { name: 'moderatorUrl', label: 'Moderator Service URL', type: 'text', value: process.env.MODERATOR_URL || 'http://localhost:3006' },
      { name: 'autoDeleteSpam', label: 'Auto-Delete Spam', type: 'checkbox', value: config.moderation?.autoDeleteSpam === true }
    ]
  };
}

// ========================================
// Configuration Update Functions
// ========================================

async function updateMessagingSettings(configData) {
  logger.info('Messaging settings updated:', configData);

  // Update runtime configuration
  if (configData.maxMessageLength) {
    config.messaging = config.messaging || {};
    config.messaging.maxMessageLength = parseInt(configData.maxMessageLength);
  }

  if (configData.messageRetention) {
    config.messaging = config.messaging || {};
    config.messaging.messageRetention = parseInt(configData.messageRetention);
  }

  if (configData.maxFileSize) {
    config.messaging = config.messaging || {};
    config.messaging.maxFileSize = parseInt(configData.maxFileSize);
  }

  return {
    message: 'Messaging settings updated successfully',
    config: configData
  };
}

async function updateMessagingModeration(configData) {
  logger.info('Messaging moderation updated:', configData);

  // Update runtime configuration
  config.moderation = config.moderation || {};

  if (configData.autoModeration !== undefined) {
    config.moderation.enabled = configData.autoModeration;
  }

  if (configData.profanityFilter !== undefined) {
    config.moderation.profanityFilter = configData.profanityFilter;
  }

  if (configData.spamDetection !== undefined) {
    config.moderation.spamDetection = configData.spamDetection;
  }

  return {
    message: 'Messaging moderation updated successfully',
    config: configData
  };
}

module.exports = router;
