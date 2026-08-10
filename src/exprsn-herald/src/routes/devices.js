/**
 * Exprsn Herald - Device Registration Routes
 * Handles push notification device token registration
 */

const express = require('express');
const router = express.Router();
const pushService = require('../services/pushService');
const { requireAuth } = require('../middleware/auth');
const { validateRegisterDevice } = require('../middleware/validation');
const logger = require('../utils/logger');

/**
 * POST /api/devices/register
 * Register device for push notifications
 */
router.post('/register', requireAuth, validateRegisterDevice, async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, platform, deviceId } = req.body;

    const pushToken = await pushService.registerDevice({
      userId,
      token,
      platform,
      deviceId
    });

    res.status(201).json({
      success: true,
      message: 'Device registered for push notifications',
      device: {
        id: pushToken.id,
        platform: pushToken.platform,
        active: pushToken.active
      }
    });
  } catch (error) {
    logger.error('Error registering device', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/devices/:id
 * Unregister device from push notifications
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    await pushService.unregisterDevice(id);

    res.json({
      success: true,
      message: 'Device unregistered from push notifications'
    });
  } catch (error) {
    logger.error('Error unregistering device', {
      error: error.message,
      deviceId: req.params.id,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/devices
 * Get user's registered devices
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const devices = await pushService.getUserDevices(userId);

    res.json({
      devices: devices.map(d => ({
        id: d.id,
        platform: d.platform,
        deviceId: d.deviceId,
        active: d.active,
        lastUsedAt: d.lastUsedAt,
        createdAt: d.createdAt
      }))
    });
  } catch (error) {
    logger.error('Error getting user devices', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
