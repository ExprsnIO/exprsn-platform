/**
 * Exprsn Herald - Notification Preferences Routes
 */

const express = require('express');
const router = express.Router();
const preferenceService = require('../services/preferenceService');
const { requireAuth } = require('../middleware/auth');
const { validateUpdatePreferences } = require('../middleware/validation');
const logger = require('../utils/logger');

/**
 * GET /api/preferences
 * Get user notification preferences
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const preferences = await preferenceService.getPreferences(userId);
    res.json({ preferences });
  } catch (error) {
    logger.error('Error getting preferences', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/preferences
 * Update notification preferences
 */
router.put('/', requireAuth, validateUpdatePreferences, async (req, res) => {
  try {
    const userId = req.user.id;
    const preferences = await preferenceService.updatePreferences(
      userId,
      req.body
    );

    res.json({
      success: true,
      message: 'Preferences updated',
      preferences
    });
  } catch (error) {
    logger.error('Error updating preferences', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/preferences/:channel
 * Update channel-specific preferences
 */
router.put('/:channel', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { channel } = req.params;

    // Validate channel
    if (!['push', 'email', 'sms', 'in-app'].includes(channel)) {
      return res.status(400).json({
        error: 'Invalid channel. Must be: push, email, sms, or in-app'
      });
    }

    const preferences = await preferenceService.updatePreferences(userId, {
      [channel]: req.body
    });

    res.json({
      success: true,
      message: `${channel} preferences updated`,
      preferences
    });
  } catch (error) {
    logger.error('Error updating channel preferences', {
      error: error.message,
      userId: req.user?.id,
      channel: req.params.channel
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/preferences/:channel/quiet-hours
 * Set quiet hours for a channel
 */
router.put('/:channel/quiet-hours', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { channel } = req.params;
    const { start, end } = req.body;

    // Validate channel
    if (!['push', 'email', 'sms', 'in-app'].includes(channel)) {
      return res.status(400).json({
        error: 'Invalid channel. Must be: push, email, sms, or in-app'
      });
    }

    // Validate hours
    if (
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      start < 0 ||
      start > 23 ||
      end < 0 ||
      end > 23
    ) {
      return res.status(400).json({
        error: 'Start and end must be numbers between 0 and 23'
      });
    }

    await preferenceService.setQuietHours(userId, channel, start, end);

    res.json({
      success: true,
      message: `Quiet hours set for ${channel}`,
      quietHours: { start, end }
    });
  } catch (error) {
    logger.error('Error setting quiet hours', {
      error: error.message,
      userId: req.user?.id,
      channel: req.params.channel
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/preferences
 * Reset preferences to defaults
 */
router.delete('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const preferences = await preferenceService.resetPreferences(userId);

    res.json({
      success: true,
      message: 'Preferences reset to defaults',
      preferences
    });
  } catch (error) {
    logger.error('Error resetting preferences', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
