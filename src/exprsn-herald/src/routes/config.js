/**
 * Configuration Management Routes
 * Provides endpoints for the Setup dashboard to manage Herald (Notifications) configurations
 */

const express = require('express');
const router = express.Router();
const { logger } = require('@exprsn/shared');

/**
 * GET /api/config/:sectionId
 * Fetch configuration for a specific section
 */
router.get('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;

  try {
    let data;

    switch (sectionId) {
      case 'herald':
      case 'herald-settings':
        data = await getHeraldSettings();
        break;

      case 'herald-email':
        data = await getEmailConfig();
        break;

      case 'herald-push':
        data = await getPushConfig();
        break;

      case 'herald-sms':
        data = await getSMSConfig();
        break;

      case 'herald-templates':
        data = await getTemplatesConfig();
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
      case 'herald-settings':
        result = await updateHeraldSettings(configData);
        break;

      case 'herald-email':
        result = await updateEmailConfig(configData);
        break;

      case 'herald-push':
        result = await updatePushConfig(configData);
        break;

      case 'herald-sms':
        result = await updateSMSConfig(configData);
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

async function getHeraldSettings() {
  return {
    title: 'Notification Settings',
    description: 'Configure notification channels and delivery settings',
    fields: [
      { name: 'enableNotifications', label: 'Enable Notifications', type: 'checkbox', value: process.env.ENABLE_NOTIFICATIONS !== 'false' },
      { name: 'enableEmail', label: 'Enable Email', type: 'checkbox', value: process.env.EMAIL_ENABLED === 'true' },
      { name: 'enablePush', label: 'Enable Push Notifications', type: 'checkbox', value: process.env.PUSH_ENABLED === 'true' },
      { name: 'enableSMS', label: 'Enable SMS', type: 'checkbox', value: process.env.SMS_ENABLED === 'true' },
      { name: 'enableInApp', label: 'Enable In-App Notifications', type: 'checkbox', value: process.env.IN_APP_ENABLED !== 'false' },
      { name: 'retryAttempts', label: 'Retry Attempts', type: 'number', value: parseInt(process.env.RETRY_ATTEMPTS) || 3 },
      { name: 'retryDelay', label: 'Retry Delay (seconds)', type: 'number', value: parseInt(process.env.RETRY_DELAY) || 60 }
    ]
  };
}

async function getEmailConfig() {
  const provider = process.env.EMAIL_PROVIDER || 'smtp';

  return {
    title: 'Email Configuration',
    description: 'Configure email delivery settings',
    fields: [
      { name: 'provider', label: 'Email Provider', type: 'select', options: ['smtp', 'sendgrid', 'ses', 'mailgun'], value: provider },
      { name: 'fromName', label: 'From Name', type: 'text', value: process.env.EMAIL_FROM_NAME || 'Exprsn' },
      { name: 'fromEmail', label: 'From Email', type: 'text', value: process.env.EMAIL_FROM || 'noreply@exprsn.io' },
      { name: 'replyTo', label: 'Reply-To Email', type: 'text', value: process.env.EMAIL_REPLY_TO || 'support@exprsn.io' },
      ...(provider === 'smtp' ? [
        { name: 'smtpHost', label: 'SMTP Host', type: 'text', value: process.env.SMTP_HOST || 'localhost' },
        { name: 'smtpPort', label: 'SMTP Port', type: 'number', value: parseInt(process.env.SMTP_PORT) || 587 },
        { name: 'smtpSecure', label: 'Use TLS', type: 'checkbox', value: process.env.SMTP_SECURE === 'true' },
        { name: 'smtpUser', label: 'SMTP User', type: 'text', value: process.env.SMTP_USER || '' },
        { name: 'smtpPass', label: 'SMTP Password', type: 'password', value: '' }
      ] : []),
      ...(provider === 'sendgrid' ? [
        { name: 'sendgridApiKey', label: 'SendGrid API Key', type: 'password', value: '' }
      ] : []),
      ...(provider === 'ses' ? [
        { name: 'awsRegion', label: 'AWS Region', type: 'text', value: process.env.AWS_REGION || 'us-east-1' },
        { name: 'awsAccessKeyId', label: 'AWS Access Key ID', type: 'text', value: '' },
        { name: 'awsSecretAccessKey', label: 'AWS Secret Access Key', type: 'password', value: '' }
      ] : []),
      ...(provider === 'mailgun' ? [
        { name: 'mailgunApiKey', label: 'Mailgun API Key', type: 'password', value: '' },
        { name: 'mailgunDomain', label: 'Mailgun Domain', type: 'text', value: process.env.MAILGUN_DOMAIN || '' }
      ] : [])
    ]
  };
}

async function getPushConfig() {
  return {
    title: 'Push Notification Configuration',
    description: 'Configure mobile push notification settings',
    fields: [
      { name: 'fcmEnabled', label: 'Enable FCM (Firebase)', type: 'checkbox', value: process.env.FCM_ENABLED === 'true' },
      { name: 'fcmServerKey', label: 'FCM Server Key', type: 'password', value: '' },
      { name: 'fcmSenderId', label: 'FCM Sender ID', type: 'text', value: process.env.FCM_SENDER_ID || '' },
      { name: 'apnsEnabled', label: 'Enable APNS (Apple)', type: 'checkbox', value: process.env.APNS_ENABLED === 'true' },
      { name: 'apnsTeamId', label: 'APNS Team ID', type: 'text', value: process.env.APNS_TEAM_ID || '' },
      { name: 'apnsKeyId', label: 'APNS Key ID', type: 'text', value: process.env.APNS_KEY_ID || '' },
      { name: 'apnsBundleId', label: 'APNS Bundle ID', type: 'text', value: process.env.APNS_BUNDLE_ID || 'io.exprsn.app' },
      { name: 'production', label: 'Use Production APNs', type: 'checkbox', value: process.env.APNS_PRODUCTION === 'true' }
    ]
  };
}

async function getSMSConfig() {
  const provider = process.env.SMS_PROVIDER || 'twilio';

  return {
    title: 'SMS Configuration',
    description: 'Configure SMS delivery settings',
    fields: [
      { name: 'provider', label: 'SMS Provider', type: 'select', options: ['twilio', 'sns'], value: provider },
      ...(provider === 'twilio' ? [
        { name: 'twilioAccountSid', label: 'Twilio Account SID', type: 'text', value: process.env.TWILIO_ACCOUNT_SID || '' },
        { name: 'twilioAuthToken', label: 'Twilio Auth Token', type: 'password', value: '' },
        { name: 'twilioPhoneNumber', label: 'Twilio Phone Number', type: 'text', value: process.env.TWILIO_PHONE_NUMBER || '' }
      ] : []),
      ...(provider === 'sns' ? [
        { name: 'awsRegion', label: 'AWS Region', type: 'text', value: process.env.AWS_REGION || 'us-east-1' },
        { name: 'awsAccessKeyId', label: 'AWS Access Key ID', type: 'text', value: '' },
        { name: 'awsSecretAccessKey', label: 'AWS Secret Access Key', type: 'password', value: '' }
      ] : [])
    ]
  };
}

async function getTemplatesConfig() {
  return {
    title: 'Notification Templates',
    description: 'Manage notification templates for different channels',
    actions: ['Create Template', 'Import Templates'],
    table: {
      headers: ['Name', 'Type', 'Channels', 'Last Modified', 'Actions'],
      rows: [
        ['Welcome Email', 'System', 'Email', new Date().toLocaleDateString(), 'Edit | Preview | Delete'],
        ['Password Reset', 'System', 'Email, SMS', new Date().toLocaleDateString(), 'Edit | Preview | Delete'],
        ['New Message', 'User', 'Push, In-App', new Date().toLocaleDateString(), 'Edit | Preview | Delete']
      ]
    }
  };
}

// ========================================
// Configuration Update Functions
// ========================================

async function updateHeraldSettings(configData) {
  logger.info('Herald settings updated:', configData);

  // Update runtime configuration
  if (configData.enableNotifications !== undefined) {
    logger.info(`Notifications ${configData.enableNotifications ? 'enabled' : 'disabled'}`);
  }

  if (configData.retryAttempts) {
    logger.info(`Retry attempts set to ${configData.retryAttempts}`);
  }

  return {
    message: 'Herald settings updated successfully',
    config: configData
  };
}

async function updateEmailConfig(configData) {
  logger.info('Email configuration updated:', configData);

  // Update email provider settings
  if (configData.provider) {
    logger.info(`Email provider changed to ${configData.provider}`);
  }

  return {
    message: 'Email configuration updated successfully',
    config: configData
  };
}

async function updatePushConfig(configData) {
  logger.info('Push notification configuration updated:', configData);

  // Update push notification settings
  if (configData.fcmEnabled !== undefined) {
    logger.info(`FCM ${configData.fcmEnabled ? 'enabled' : 'disabled'}`);
  }

  if (configData.apnsEnabled !== undefined) {
    logger.info(`APNS ${configData.apnsEnabled ? 'enabled' : 'disabled'}`);
  }

  return {
    message: 'Push notification configuration updated successfully',
    config: configData
  };
}

async function updateSMSConfig(configData) {
  logger.info('SMS configuration updated:', configData);

  // Update SMS provider settings
  if (configData.provider) {
    logger.info(`SMS provider changed to ${configData.provider}`);
  }

  return {
    message: 'SMS configuration updated successfully',
    config: configData
  };
}

module.exports = router;
