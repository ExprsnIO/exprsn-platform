/**
 * Herald (Notifications) Administration Routes
 * Provides endpoints for managing notifications, templates, and delivery settings
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const { spawn, exec } = require('child_process');
const path = require('path');

const HERALD_URL = process.env.HERALD_URL || 'http://localhost:3014';
const HERALD_PATH = process.env.HERALD_PATH || path.join(__dirname, '../../../exprsn-herald');

// ========================================
// Herald Service Status
// ========================================

/**
 * GET /api/herald/status
 * Get Herald service status and health
 */
router.get('/status', async (req, res) => {
  try {
    const [healthRes, queueRes] = await Promise.all([
      axios.get(`${HERALD_URL}/health`),
      axios.get(`${HERALD_URL}/health/queue`)
    ]);

    res.json({
      success: true,
      status: healthRes.data,
      queues: queueRes.data
    });
  } catch (error) {
    logger.error('Failed to fetch Herald status:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to connect to Herald service'
    });
  }
});

// ========================================
// Configuration Management
// ========================================

/**
 * GET /api/herald/config/:section
 * Get configuration for a specific section
 */
router.get('/config/:section', async (req, res) => {
  const { section } = req.params;

  try {
    const response = await axios.get(`${HERALD_URL}/api/config/${section}`);
    res.json({
      success: true,
      config: response.data
    });
  } catch (error) {
    logger.error(`Failed to fetch Herald config (${section}):`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/herald/config/:section
 * Update configuration for a specific section
 */
router.post('/config/:section', async (req, res) => {
  const { section } = req.params;
  const configData = req.body;

  try {
    const response = await axios.post(`${HERALD_URL}/api/config/${section}`, configData);

    // Emit socket event
    if (req.app.get('io')) {
      req.app.get('io').emit('herald:config-updated', {
        timestamp: new Date().toISOString(),
        section,
        config: configData
      });
    }

    res.json({
      success: true,
      result: response.data
    });
  } catch (error) {
    logger.error(`Failed to update Herald config (${section}):`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// Notifications Management
// ========================================

/**
 * GET /api/herald/notifications
 * Get list of notifications with filtering
 */
router.get('/notifications', async (req, res) => {
  const { userId, status, channel, limit, offset } = req.query;

  try {
    const response = await axios.get(`${HERALD_URL}/api/notifications`, {
      params: { userId, status, channel, limit: limit || 50, offset: offset || 0 }
    });

    res.json({
      success: true,
      notifications: response.data.notifications || [],
      total: response.data.total || 0,
      pagination: response.data.pagination || {}
    });
  } catch (error) {
    logger.error('Failed to fetch notifications:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/herald/notifications
 * Create and send a new notification
 */
router.post('/notifications', async (req, res) => {
  const notificationData = req.body;

  try {
    const response = await axios.post(`${HERALD_URL}/api/notifications`, notificationData);

    // Emit socket event
    if (req.app.get('io')) {
      req.app.get('io').emit('herald:notification-sent', {
        timestamp: new Date().toISOString(),
        notification: response.data
      });
    }

    res.json({
      success: true,
      notification: response.data
    });
  } catch (error) {
    logger.error('Failed to create notification:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/herald/notifications/:id
 * Get notification details
 */
router.get('/notifications/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const response = await axios.get(`${HERALD_URL}/api/notifications/${id}`);
    res.json({
      success: true,
      notification: response.data
    });
  } catch (error) {
    logger.error(`Failed to fetch notification ${id}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// Templates Management
// ========================================

/**
 * GET /api/herald/templates
 * Get list of notification templates
 */
router.get('/templates', async (req, res) => {
  const { type, channel } = req.query;

  try {
    const response = await axios.get(`${HERALD_URL}/api/templates`, {
      params: { type, channel }
    });

    res.json({
      success: true,
      templates: response.data.templates || []
    });
  } catch (error) {
    logger.error('Failed to fetch templates:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/herald/templates
 * Create a new notification template
 */
router.post('/templates', async (req, res) => {
  const templateData = req.body;

  try {
    const response = await axios.post(`${HERALD_URL}/api/templates`, templateData);
    res.json({
      success: true,
      template: response.data
    });
  } catch (error) {
    logger.error('Failed to create template:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/herald/templates/:id
 * Get template details
 */
router.get('/templates/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const response = await axios.get(`${HERALD_URL}/api/templates/${id}`);
    res.json({
      success: true,
      template: response.data
    });
  } catch (error) {
    logger.error(`Failed to fetch template ${id}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/herald/templates/:id
 * Update a template
 */
router.put('/templates/:id', async (req, res) => {
  const { id } = req.params;
  const templateData = req.body;

  try {
    const response = await axios.put(`${HERALD_URL}/api/templates/${id}`, templateData);
    res.json({
      success: true,
      template: response.data
    });
  } catch (error) {
    logger.error(`Failed to update template ${id}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/herald/templates/:id
 * Delete a template
 */
router.delete('/templates/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await axios.delete(`${HERALD_URL}/api/templates/${id}`);
    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    logger.error(`Failed to delete template ${id}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// Statistics & Analytics
// ========================================

/**
 * GET /api/herald/stats
 * Get notification statistics
 */
router.get('/stats', async (req, res) => {
  const { startDate, endDate, channel } = req.query;

  try {
    // Since Herald may not have a stats endpoint, we'll create aggregated stats
    const notificationsRes = await axios.get(`${HERALD_URL}/api/notifications`, {
      params: { limit: 1000 }
    });

    const notifications = notificationsRes.data.notifications || [];

    const stats = {
      total: notifications.length,
      byChannel: {
        email: notifications.filter(n => n.channel === 'email').length,
        push: notifications.filter(n => n.channel === 'push').length,
        sms: notifications.filter(n => n.channel === 'sms').length,
        inApp: notifications.filter(n => n.channel === 'in-app').length
      },
      byStatus: {
        sent: notifications.filter(n => n.status === 'sent').length,
        delivered: notifications.filter(n => n.status === 'delivered').length,
        failed: notifications.filter(n => n.status === 'failed').length,
        pending: notifications.filter(n => n.status === 'pending').length
      },
      recentActivity: notifications.slice(0, 10).map(n => ({
        id: n.id,
        channel: n.channel,
        status: n.status,
        createdAt: n.createdAt
      }))
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Failed to fetch notification stats:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// Device Management
// ========================================

/**
 * GET /api/herald/devices
 * Get registered devices for push notifications
 */
router.get('/devices', async (req, res) => {
  const { userId, platform } = req.query;

  try {
    const response = await axios.get(`${HERALD_URL}/api/devices`, {
      params: { userId, platform }
    });

    res.json({
      success: true,
      devices: response.data.devices || []
    });
  } catch (error) {
    logger.error('Failed to fetch devices:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/herald/devices/:id
 * Unregister a device
 */
router.delete('/devices/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await axios.delete(`${HERALD_URL}/api/devices/${id}`);
    res.json({
      success: true,
      message: 'Device unregistered successfully'
    });
  } catch (error) {
    logger.error(`Failed to delete device ${id}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// Test Notifications
// ========================================

/**
 * POST /api/herald/test
 * Send a test notification
 */
router.post('/test', async (req, res) => {
  const { channel, recipient, message } = req.body;

  try {
    const testNotification = {
      userId: recipient,
      channel,
      title: 'Test Notification',
      body: message || 'This is a test notification from Herald admin',
      data: {
        test: true,
        timestamp: new Date().toISOString()
      }
    };

    const response = await axios.post(`${HERALD_URL}/api/notifications`, testNotification);

    res.json({
      success: true,
      message: 'Test notification sent successfully',
      notification: response.data
    });
  } catch (error) {
    logger.error('Failed to send test notification:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// Service Control
// ========================================

/**
 * POST /api/herald/service/start
 * Start Herald service
 */
router.post('/service/start', async (req, res) => {
  try {
    const heraldDir = HERALD_PATH;

    // Check if service is already running
    try {
      const healthRes = await axios.get(`${HERALD_URL}/health`, { timeout: 2000 });
      if (healthRes.data.status === 'healthy') {
        return res.json({
          success: true,
          message: 'Herald service is already running',
          status: 'running'
        });
      }
    } catch (error) {
      // Service not running, proceed to start
    }

    // Start the service
    const child = spawn('node', ['src/index.js'], {
      cwd: heraldDir,
      detached: true,
      stdio: 'ignore'
    });

    child.unref();

    // Wait a bit and check if it started
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      const healthRes = await axios.get(`${HERALD_URL}/health`, { timeout: 5000 });
      res.json({
        success: true,
        message: 'Herald service started successfully',
        status: healthRes.data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Service started but health check failed',
        message: 'Herald may still be initializing'
      });
    }
  } catch (error) {
    logger.error('Failed to start Herald service:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/herald/service/stop
 * Stop Herald service
 */
router.post('/service/stop', async (req, res) => {
  try {
    exec('pkill -f "node.*herald.*index.js"', (error, stdout, stderr) => {
      if (error && error.code !== 1) {
        logger.error('Failed to stop Herald service:', error.message);
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }

      res.json({
        success: true,
        message: 'Herald service stopped successfully'
      });
    });
  } catch (error) {
    logger.error('Failed to stop Herald service:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/herald/service/restart
 * Restart Herald service
 */
router.post('/service/restart', async (req, res) => {
  try {
    // Stop the service
    exec('pkill -f "node.*herald.*index.js"', async (error) => {
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Start the service
      const heraldDir = HERALD_PATH;
      const child = spawn('node', ['src/index.js'], {
        cwd: heraldDir,
        detached: true,
        stdio: 'ignore'
      });

      child.unref();

      // Wait and verify
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        const healthRes = await axios.get(`${HERALD_URL}/health`, { timeout: 5000 });
        res.json({
          success: true,
          message: 'Herald service restarted successfully',
          status: healthRes.data
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Service restart initiated but health check failed'
        });
      }
    });
  } catch (error) {
    logger.error('Failed to restart Herald service:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/herald/config/save
 * Save configuration to .env file
 */
router.post('/config/save', async (req, res) => {
  const { section, config } = req.body;

  try {
    const fs = require('fs');
    const envPath = path.join(HERALD_PATH, '.env');

    // Read current .env file
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Update environment variables based on section
    const envVars = convertConfigToEnv(section, config);

    // Update or add each variable
    for (const [key, value] of Object.entries(envVars)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    }

    // Write back to file
    fs.writeFileSync(envPath, envContent);

    logger.info(`Configuration saved for section: ${section}`);

    res.json({
      success: true,
      message: 'Configuration saved successfully. Restart service to apply changes.'
    });
  } catch (error) {
    logger.error('Failed to save configuration:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

function convertConfigToEnv(section, config) {
  const envVars = {};

  switch (section) {
    case 'herald-settings':
      if (config.enableNotifications !== undefined) envVars.ENABLE_NOTIFICATIONS = config.enableNotifications;
      if (config.enableEmail !== undefined) envVars.EMAIL_ENABLED = config.enableEmail;
      if (config.enablePush !== undefined) envVars.PUSH_ENABLED = config.enablePush;
      if (config.enableSMS !== undefined) envVars.SMS_ENABLED = config.enableSMS;
      if (config.enableInApp !== undefined) envVars.IN_APP_ENABLED = config.enableInApp;
      if (config.retryAttempts) envVars.RETRY_ATTEMPTS = config.retryAttempts;
      if (config.retryDelay) envVars.RETRY_DELAY = config.retryDelay;
      break;

    case 'herald-email':
      if (config.provider) envVars.EMAIL_PROVIDER = config.provider;
      if (config.fromName) envVars.EMAIL_FROM_NAME = config.fromName;
      if (config.fromEmail) envVars.EMAIL_FROM = config.fromEmail;
      if (config.replyTo) envVars.EMAIL_REPLY_TO = config.replyTo;

      // SMTP
      if (config.smtpHost) envVars.SMTP_HOST = config.smtpHost;
      if (config.smtpPort) envVars.SMTP_PORT = config.smtpPort;
      if (config.smtpSecure !== undefined) envVars.SMTP_SECURE = config.smtpSecure;
      if (config.smtpUser) envVars.SMTP_USER = config.smtpUser;
      if (config.smtpPass) envVars.SMTP_PASSWORD = config.smtpPass;

      // SendGrid
      if (config.sendgridApiKey) envVars.SENDGRID_API_KEY = config.sendgridApiKey;

      // AWS SES
      if (config.awsRegion) envVars.AWS_REGION = config.awsRegion;
      if (config.awsAccessKeyId) envVars.AWS_ACCESS_KEY_ID = config.awsAccessKeyId;
      if (config.awsSecretAccessKey) envVars.AWS_SECRET_ACCESS_KEY = config.awsSecretAccessKey;

      // Mailgun
      if (config.mailgunApiKey) envVars.MAILGUN_API_KEY = config.mailgunApiKey;
      if (config.mailgunDomain) envVars.MAILGUN_DOMAIN = config.mailgunDomain;
      break;

    case 'herald-push':
      if (config.fcmEnabled !== undefined) envVars.FCM_ENABLED = config.fcmEnabled;
      if (config.fcmServerKey) envVars.FCM_SERVER_KEY = config.fcmServerKey;
      if (config.fcmSenderId) envVars.FCM_SENDER_ID = config.fcmSenderId;
      if (config.apnsEnabled !== undefined) envVars.APNS_ENABLED = config.apnsEnabled;
      if (config.apnsTeamId) envVars.APNS_TEAM_ID = config.apnsTeamId;
      if (config.apnsKeyId) envVars.APNS_KEY_ID = config.apnsKeyId;
      if (config.apnsBundleId) envVars.APNS_BUNDLE_ID = config.apnsBundleId;
      if (config.production !== undefined) envVars.APNS_PRODUCTION = config.production;
      break;

    case 'herald-sms':
      if (config.provider) envVars.SMS_PROVIDER = config.provider;

      // Twilio
      if (config.twilioAccountSid) envVars.TWILIO_ACCOUNT_SID = config.twilioAccountSid;
      if (config.twilioAuthToken) envVars.TWILIO_AUTH_TOKEN = config.twilioAuthToken;
      if (config.twilioPhoneNumber) envVars.TWILIO_PHONE_NUMBER = config.twilioPhoneNumber;

      // AWS SNS
      if (config.awsRegion) envVars.AWS_REGION = config.awsRegion;
      if (config.awsAccessKeyId) envVars.AWS_ACCESS_KEY_ID = config.awsAccessKeyId;
      if (config.awsSecretAccessKey) envVars.AWS_SECRET_ACCESS_KEY = config.awsSecretAccessKey;
      break;
  }

  return envVars;
}

module.exports = router;
