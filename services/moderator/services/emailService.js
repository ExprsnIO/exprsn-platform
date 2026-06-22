/**
 * ═══════════════════════════════════════════════════════════
 * Email Notification Service
 * Send email notifications for moderation actions
 * ═══════════════════════════════════════════════════════════
 */

const nodemailer = require('nodemailer');
const Handlebars = require('handlebars');
const logger = require('../src/utils/logger');
const { EmailTemplate, EmailLog } = require('../models/sequelize-index');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  /**
   * Initialize email service
   */
  async initialize() {
    if (this.initialized) {
      logger.warn('Email service already initialized');
      return;
    }

    logger.info('Initializing email service');

    // Configure transporter based on environment
    if (process.env.EMAIL_PROVIDER === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      });
    } else if (process.env.EMAIL_PROVIDER === 'sendgrid') {
      this.transporter = nodemailer.createTransport({
        service: 'SendGrid',
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY
        }
      });
    } else {
      // Default: ethereal for testing
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });

      logger.info('Using Ethereal test account for emails', {
        user: testAccount.user,
        webUrl: 'https://ethereal.email/'
      });
    }

    this.initialized = true;
    logger.info('Email service initialized');
  }

  /**
   * Send email using template
   * @param {Object} options - Email options
   */
  async sendTemplateEmail(options) {
    const {
      templateType,
      recipient,
      data = {},
      moderationItemId = null,
      userActionId = null
    } = options;

    try {
      // Find template
      const template = await EmailTemplate.findOne({
        where: {
          type: templateType,
          enabled: true
        },
        order: [['isDefault', 'DESC']]
      });

      if (!template) {
        throw new Error(`Email template not found: ${templateType}`);
      }

      // Render template
      const rendered = template.render(data);

      // Send email
      const result = await this.sendEmail({
        to: recipient,
        subject: rendered.subject,
        text: rendered.bodyText,
        html: rendered.bodyHtml,
        templateId: template.id,
        moderationItemId,
        userActionId
      });

      logger.info('Template email sent', {
        templateType,
        recipient,
        messageId: result.messageId
      });

      return result;

    } catch (error) {
      logger.error('Failed to send template email', {
        error: error.message,
        templateType,
        recipient
      });
      throw error;
    }
  }

  /**
   * Send email
   * @param {Object} options - Email options
   */
  async sendEmail(options) {
    if (!this.initialized) {
      await this.initialize();
    }

    const {
      to,
      subject,
      text,
      html,
      from = process.env.EMAIL_FROM || 'noreply@exprsn.io',
      templateId = null,
      moderationItemId = null,
      userActionId = null
    } = options;

    const startTime = Date.now();

    try {
      // Send email
      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        text,
        html
      });

      // Log successful send
      await EmailLog.create({
        templateId,
        recipient: to,
        subject,
        body: text,
        status: 'sent',
        moderationItemId,
        userActionId,
        metadata: {
          messageId: info.messageId,
          response: info.response
        },
        sentAt: Date.now()
      });

      logger.info('Email sent successfully', {
        recipient: to,
        subject,
        messageId: info.messageId,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: nodemailer.getTestMessageUrl(info) // For Ethereal
      };

    } catch (error) {
      // Log failed send
      await EmailLog.create({
        templateId,
        recipient: to,
        subject,
        body: text,
        status: 'failed',
        errorMessage: error.message,
        moderationItemId,
        userActionId,
        metadata: {}
      });

      logger.error('Failed to send email', {
        error: error.message,
        recipient: to,
        subject
      });

      throw error;
    }
  }

  /**
   * Send content approved notification
   */
  async sendContentApproved(userId, contentId, contentType) {
    return await this.sendTemplateEmail({
      templateType: 'content_approved',
      recipient: await this.getUserEmail(userId),
      data: {
        userId,
        contentId,
        contentType,
        date: new Date().toLocaleDateString()
      }
    });
  }

  /**
   * Send content rejected notification
   */
  async sendContentRejected(userId, contentId, contentType, reason) {
    return await this.sendTemplateEmail({
      templateType: 'content_rejected',
      recipient: await this.getUserEmail(userId),
      data: {
        userId,
        contentId,
        contentType,
        reason,
        date: new Date().toLocaleDateString()
      }
    });
  }

  /**
   * Send user warning notification
   */
  async sendUserWarning(userId, reason, relatedContent = null) {
    return await this.sendTemplateEmail({
      templateType: 'user_warned',
      recipient: await this.getUserEmail(userId),
      data: {
        userId,
        reason,
        relatedContent,
        date: new Date().toLocaleDateString()
      }
    });
  }

  /**
   * Send user suspension notification
   */
  async sendUserSuspended(userId, reason, duration, expiresAt) {
    return await this.sendTemplateEmail({
      templateType: 'user_suspended',
      recipient: await this.getUserEmail(userId),
      data: {
        userId,
        reason,
        duration: this.formatDuration(duration),
        expiresAt: new Date(expiresAt).toLocaleString(),
        date: new Date().toLocaleDateString()
      }
    });
  }

  /**
   * Send user ban notification
   */
  async sendUserBanned(userId, reason) {
    return await this.sendTemplateEmail({
      templateType: 'user_banned',
      recipient: await this.getUserEmail(userId),
      data: {
        userId,
        reason,
        date: new Date().toLocaleDateString()
      }
    });
  }

  /**
   * Send appeal received notification
   */
  async sendAppealReceived(userId, appealId) {
    return await this.sendTemplateEmail({
      templateType: 'appeal_received',
      recipient: await this.getUserEmail(userId),
      data: {
        userId,
        appealId,
        date: new Date().toLocaleDateString()
      }
    });
  }

  /**
   * Send appeal approved notification
   */
  async sendAppealApproved(userId, appealId, decision) {
    return await this.sendTemplateEmail({
      templateType: 'appeal_approved',
      recipient: await this.getUserEmail(userId),
      data: {
        userId,
        appealId,
        decision,
        date: new Date().toLocaleDateString()
      }
    });
  }

  /**
   * Send appeal denied notification
   */
  async sendAppealDenied(userId, appealId, reason) {
    return await this.sendTemplateEmail({
      templateType: 'appeal_denied',
      recipient: await this.getUserEmail(userId),
      data: {
        userId,
        appealId,
        reason,
        date: new Date().toLocaleDateString()
      }
    });
  }

  /**
   * Get user email address
   * In production, this would query the auth service
   */
  async getUserEmail(userId) {
    // TODO: Integrate with exprsn-auth to get user email
    // For now, return a placeholder
    return `user-${userId}@example.com`;
  }

  /**
   * Format duration in human-readable format
   */
  formatDuration(seconds) {
    if (seconds < 3600) {
      return `${Math.round(seconds / 60)} minutes`;
    } else if (seconds < 86400) {
      return `${Math.round(seconds / 3600)} hours`;
    } else {
      return `${Math.round(seconds / 86400)} days`;
    }
  }

  /**
   * Verify email configuration
   */
  async verify() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      await this.transporter.verify();
      logger.info('Email service verified successfully');
      return { success: true };
    } catch (error) {
      logger.error('Email service verification failed', {
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new EmailService();
