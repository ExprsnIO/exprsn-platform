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
const moderationConfig = require('../services/moderationConfig');
const { requireToken, requireAdmin } = require('../middleware/auth');

// Platform-config management is admin-only (same guard as /api/jobs). Without
// this the section endpoints were reachable by any caller.
router.use(requireToken(), requireAdmin());

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
      createdAt: {
        [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
      }
    }
  });

  return {
    title: 'Timeline Settings',
    description: 'Configure timeline feed settings',
    fields: [
      { name: 'maxPostLength', label: 'Max Post Length', type: 'number', value: config.posts?.maxLength || 4000 },
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
  const m = await moderationConfig.getModeration();

  return {
    title: 'Timeline Moderation',
    description: 'Configure content moderation for timeline posts. Settings persist across restarts.',
    fields: [
      { name: 'autoModeration', label: 'Auto-Moderation', type: 'checkbox', value: m.autoModeration },
      {
        name: 'moderationProvider',
        label: 'Moderation Provider',
        type: 'select',
        options: moderationConfig.MODERATION_PROVIDERS,
        value: m.moderationProvider
      },
      { name: 'externalProviderUrl', label: 'External Service URL (e.g. Bluesky labeler)', type: 'text', value: m.externalProviderUrl },
      { name: 'contentFilters', label: 'Content Filters', type: 'checkbox', value: m.contentFilters },
      { name: 'spamDetection', label: 'Spam Detection', type: 'checkbox', value: m.spamDetection },
      { name: 'moderatorUrl', label: 'Moderator Service URL', type: 'text', value: process.env.MODERATOR_SERVICE_URL || process.env.MODERATOR_URL || 'https://localhost:8443/moderator' },
      { name: 'flagThreshold', label: 'Auto-Flag Threshold', type: 'number', value: m.flagThreshold },
      { name: 'enableUserReporting', label: 'Enable User Reporting', type: 'checkbox', value: m.enableUserReporting },
      { name: 'requireApproval', label: 'Require Approval for New Posts', type: 'checkbox', value: m.requireApproval },
      {
        name: 'approvalMechanism',
        label: 'Approval Mechanism',
        type: 'select',
        options: moderationConfig.APPROVAL_MECHANISMS,
        value: m.approvalMechanism
      },
      {
        name: 'approvalTarget',
        label: 'Approval Target (lowcode_workflow: "appKey/flowKey" · lowcode_app: appKey · webhook: URL)',
        type: 'text',
        value: m.approvalTarget
      },
      { name: 'approvalSecret', label: 'Approval Secret (hook token / HMAC key)', type: 'password', value: m.approvalSecret ? '••••••••' : '' }
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
  // The editor round-trips the whole schema ({ fields: [...] }); accept either
  // that shape or a flat key→value object.
  const flat = Array.isArray(configData?.fields)
    ? Object.fromEntries(configData.fields.map((f) => [f.name, f.value]))
    : (configData || {});

  const patch = {};
  for (const k of ['autoModeration', 'contentFilters', 'spamDetection', 'enableUserReporting', 'requireApproval']) {
    if (flat[k] !== undefined) patch[k] = Boolean(flat[k]);
  }
  if (flat.moderationProvider !== undefined) patch.moderationProvider = String(flat.moderationProvider);
  if (flat.externalProviderUrl !== undefined) patch.externalProviderUrl = String(flat.externalProviderUrl || '');
  if (flat.flagThreshold !== undefined && flat.flagThreshold !== '') patch.flagThreshold = parseInt(flat.flagThreshold, 10) || 3;
  if (flat.approvalMechanism !== undefined) patch.approvalMechanism = String(flat.approvalMechanism);
  if (flat.approvalTarget !== undefined) patch.approvalTarget = String(flat.approvalTarget || '').trim();
  // The GET masks the secret; only persist a real new value.
  if (flat.approvalSecret !== undefined && flat.approvalSecret !== '' && !/^•+$/.test(String(flat.approvalSecret))) {
    patch.approvalSecret = String(flat.approvalSecret);
  }

  const saved = await moderationConfig.setSection('moderation', patch);

  // Mirror into the runtime config for legacy readers.
  config.moderation = {
    ...(config.moderation || {}),
    enabled: saved.autoModeration,
    requireApproval: saved.requireApproval,
    flagThreshold: saved.flagThreshold,
    contentFilters: saved.contentFilters,
    spamDetection: saved.spamDetection,
    userReporting: saved.enableUserReporting
  };

  logger.info('Timeline moderation updated');
  return {
    message: 'Timeline moderation updated successfully',
    config: { ...saved, approvalSecret: saved.approvalSecret ? '••••••••' : '' }
  };
}

module.exports = router;
