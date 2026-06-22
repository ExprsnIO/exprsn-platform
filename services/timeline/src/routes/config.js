/**
 * Configuration Management Routes
 * Provides endpoints for the Setup dashboard to manage Timeline configurations
 */

const express = require('express');
const router = express.Router();
const { Post, List } = require('../models');
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
      case 'timeline-settings':
        data = await getTimelineSettings();
        break;

      case 'timeline-moderation':
        data = await getTimelineModeration();
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
      case 'timeline-settings':
        result = await updateTimelineSettings(configData);
        break;

      case 'timeline-moderation':
        result = await updateTimelineModeration(configData);
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

async function getTimelineSettings() {
  // Get timeline statistics
  const totalPosts = await Post.count();
  const totalLists = await List.count();
  const todayPosts = await Post.count({
    where: {
      created_at: {
        [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
      }
    }
  });

  return {
    title: 'Timeline Settings',
    description: 'Configure timeline feed settings',
    fields: [
      { name: 'maxPostLength', label: 'Max Post Length', type: 'number', value: config.posts?.maxLength || 280 },
      { name: 'enableSearch', label: 'Enable Search', type: 'checkbox', value: config.features?.search !== false },
      { name: 'enableReactions', label: 'Enable Reactions', type: 'checkbox', value: config.features?.reactions !== false },
      { name: 'enableReposts', label: 'Enable Reposts', type: 'checkbox', value: config.features?.reposts !== false },
      { name: 'enableBookmarks', label: 'Enable Bookmarks', type: 'checkbox', value: config.features?.bookmarks !== false },
      { name: 'enableLists', label: 'Enable Lists', type: 'checkbox', value: config.features?.lists !== false },
      { name: 'enableHashtags', label: 'Enable Hashtags', type: 'checkbox', value: config.features?.hashtags !== false },
      { name: 'enableMentions', label: 'Enable Mentions', type: 'checkbox', value: config.features?.mentions !== false },
      { name: 'postsPerPage', label: 'Posts Per Page', type: 'number', value: config.pagination?.limit || 20 }
    ],
    stats: {
      totalPosts,
      totalLists,
      todayPosts
    }
  };
}

async function getTimelineModeration() {
  return {
    title: 'Timeline Moderation',
    description: 'Configure content moderation for timeline posts',
    fields: [
      { name: 'autoModeration', label: 'Auto-Moderation', type: 'checkbox', value: config.moderation?.enabled !== false },
      { name: 'requireApproval', label: 'Require Approval for New Posts', type: 'checkbox', value: config.moderation?.requireApproval === true },
      { name: 'contentFilters', label: 'Content Filters', type: 'checkbox', value: config.moderation?.contentFilters !== false },
      { name: 'spamDetection', label: 'Spam Detection', type: 'checkbox', value: config.moderation?.spamDetection !== false },
      { name: 'moderatorUrl', label: 'Moderator Service URL', type: 'text', value: process.env.MODERATOR_URL || 'http://localhost:3006' },
      { name: 'flagThreshold', label: 'Auto-Flag Threshold', type: 'number', value: config.moderation?.flagThreshold || 3 },
      { name: 'enableUserReporting', label: 'Enable User Reporting', type: 'checkbox', value: config.moderation?.userReporting !== false }
    ]
  };
}

// ========================================
// Configuration Update Functions
// ========================================

async function updateTimelineSettings(configData) {
  logger.info('Timeline settings updated:', configData);

  // Update runtime configuration
  if (configData.maxPostLength) {
    config.posts = config.posts || {};
    config.posts.maxLength = parseInt(configData.maxPostLength);
  }

  if (configData.postsPerPage) {
    config.pagination = config.pagination || {};
    config.pagination.limit = parseInt(configData.postsPerPage);
  }

  return {
    message: 'Timeline settings updated successfully',
    config: configData
  };
}

async function updateTimelineModeration(configData) {
  logger.info('Timeline moderation updated:', configData);

  // Update runtime configuration
  config.moderation = config.moderation || {};

  if (configData.autoModeration !== undefined) {
    config.moderation.enabled = configData.autoModeration;
  }

  if (configData.requireApproval !== undefined) {
    config.moderation.requireApproval = configData.requireApproval;
  }

  if (configData.flagThreshold) {
    config.moderation.flagThreshold = parseInt(configData.flagThreshold);
  }

  return {
    message: 'Timeline moderation updated successfully',
    config: configData
  };
}

module.exports = router;
