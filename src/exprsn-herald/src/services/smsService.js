/**
 * Exprsn Herald - SMS Service
 * Handles SMS delivery via Twilio
 */

const validator = require('validator');
const { DeliveryLog } = require('../models');
const config = require('../config');
const logger = require('../utils/logger');

// Twilio client
let twilioClient = null;
if (config.sms.twilio.accountSid && config.sms.twilio.authToken) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(
      config.sms.twilio.accountSid,
      config.sms.twilio.authToken
    );
    logger.info('Twilio client initialized');
  } catch (error) {
    logger.warn('Twilio client not initialized', { error: error.message });
  }
}

class SMSService {
  /**
   * Send SMS
   */
  async sendSMS({ to, body, notificationId = null }) {
    try {
      // Validate phone number
      if (!this.validatePhoneNumber(to)) {
        throw new Error('Invalid phone number');
      }

      if (!body || body.trim().length === 0) {
        throw new Error('SMS body is required');
      }

      // Use configured provider
      const provider = config.sms.provider || 'twilio';

      let result;
      if (provider === 'twilio') {
        result = await this.sendTwilioSMS({ to, body, notificationId });
      } else {
        throw new Error(`Unsupported SMS provider: ${provider}`);
      }

      logger.info('SMS sent successfully', { to, provider });
      return result;
    } catch (error) {
      logger.error('Error sending SMS', {
        error: error.message,
        to
      });
      throw error;
    }
  }

  /**
   * Send SMS via Twilio
   */
  async sendTwilioSMS({ to, body, notificationId }) {
    try {
      if (!twilioClient) {
        throw new Error('Twilio client not initialized');
      }

      // Create delivery log
      let deliveryLog = null;
      if (notificationId) {
        deliveryLog = await DeliveryLog.create({
          notificationId,
          channel: 'sms',
          provider: 'twilio',
          status: 'pending'
        });
      }

      // Send SMS
      const message = await twilioClient.messages.create({
        body,
        from: config.sms.twilio.from,
        to
      });

      // Update delivery log
      if (deliveryLog) {
        await deliveryLog.update({
          status: 'sent',
          sentAt: new Date(),
          metadata: {
            messageSid: message.sid,
            status: message.status
          }
        });
      }

      logger.info('Twilio SMS sent', {
        messageSid: message.sid,
        to,
        status: message.status
      });

      return {
        success: true,
        messageSid: message.sid,
        status: message.status,
        deliveryLogId: deliveryLog?.id
      };
    } catch (error) {
      logger.error('Error sending Twilio SMS', {
        error: error.message,
        to
      });

      // Update delivery log on failure
      if (notificationId) {
        await DeliveryLog.update(
          {
            status: 'failed',
            error: error.message
          },
          {
            where: { notificationId, channel: 'sms' }
          }
        );
      }

      throw error;
    }
  }

  /**
   * Validate phone number
   */
  validatePhoneNumber(phone) {
    try {
      // Remove common formatting characters
      const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

      // Check if it's a valid mobile phone (E.164 format preferred)
      return validator.isMobilePhone(cleaned, 'any', { strictMode: false });
    } catch (error) {
      return false;
    }
  }

  /**
   * Format phone number to E.164
   */
  formatPhoneNumber(phone, countryCode = '1') {
    try {
      // Remove all non-digit characters
      let cleaned = phone.replace(/\D/g, '');

      // Add country code if not present
      if (!cleaned.startsWith(countryCode)) {
        cleaned = countryCode + cleaned;
      }

      // Add + prefix
      if (!cleaned.startsWith('+')) {
        cleaned = '+' + cleaned;
      }

      return cleaned;
    } catch (error) {
      logger.error('Error formatting phone number', {
        error: error.message,
        phone
      });
      return phone;
    }
  }

  /**
   * Send test SMS
   */
  async sendTestSMS(to) {
    try {
      const body = 'Test SMS from Exprsn Herald notification service.';

      return await this.sendSMS({ to, body });
    } catch (error) {
      logger.error('Error sending test SMS', {
        error: error.message,
        to
      });
      throw error;
    }
  }

  /**
   * Handle Twilio webhook (delivery status updates)
   */
  async handleTwilioWebhook(data) {
    try {
      const { MessageSid, MessageStatus, ErrorCode } = data;

      // Find delivery log by message SID
      const deliveryLog = await DeliveryLog.findOne({
        where: {
          channel: 'sms',
          provider: 'twilio'
        },
        order: [['createdAt', 'DESC']]
      });

      if (deliveryLog && deliveryLog.metadata?.messageSid === MessageSid) {
        const statusMap = {
          delivered: 'delivered',
          sent: 'sent',
          failed: 'failed',
          undelivered: 'failed'
        };

        await deliveryLog.update({
          status: statusMap[MessageStatus] || 'pending',
          deliveredAt:
            MessageStatus === 'delivered' ? new Date() : null,
          error: ErrorCode ? `Twilio error code: ${ErrorCode}` : null,
          metadata: {
            ...deliveryLog.metadata,
            status: MessageStatus,
            errorCode: ErrorCode
          }
        });

        logger.info('Twilio webhook processed', {
          messageSid: MessageSid,
          status: MessageStatus
        });
      }

      return { success: true };
    } catch (error) {
      logger.error('Error handling Twilio webhook', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get SMS delivery statistics
   */
  async getDeliveryStats(startDate, endDate) {
    try {
      const { Op } = require('sequelize');
      const { sequelize } = require('../models');

      const stats = await DeliveryLog.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: {
          channel: 'sms',
          createdAt: {
            [Op.between]: [startDate, endDate]
          }
        },
        group: ['status']
      });

      const result = {
        total: 0,
        sent: 0,
        delivered: 0,
        failed: 0
      };

      for (const stat of stats) {
        const count = parseInt(stat.dataValues.count);
        result.total += count;
        result[stat.status] = count;
      }

      return result;
    } catch (error) {
      logger.error('Error getting SMS delivery stats', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check Twilio account balance (if available)
   */
  async checkBalance() {
    try {
      if (!twilioClient) {
        throw new Error('Twilio client not initialized');
      }

      const balance = await twilioClient.balance.fetch();

      logger.info('Twilio balance checked', {
        balance: balance.balance,
        currency: balance.currency
      });

      return {
        balance: balance.balance,
        currency: balance.currency
      };
    } catch (error) {
      logger.error('Error checking Twilio balance', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new SMSService();
