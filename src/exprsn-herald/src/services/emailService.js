/**
 * Exprsn Herald - Email Service
 * Handles email delivery via SMTP/SendGrid/SES
 */

const nodemailer = require('nodemailer');
const Handlebars = require('handlebars');
const validator = require('validator');
const config = require('../config');
const templateService = require('./templateService');
const { DeliveryLog } = require('../models');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter based on configuration
   */
  initializeTransporter() {
    try {
      const provider = config.email.provider || 'smtp';

      switch (provider) {
        case 'smtp':
          this.transporter = nodemailer.createTransport({
            host: config.email.smtp.host,
            port: config.email.smtp.port,
            secure: config.email.smtp.secure,
            auth: {
              user: config.email.smtp.auth.user,
              pass: config.email.smtp.auth.pass
            }
          });
          break;

        case 'sendgrid':
          this.transporter = nodemailer.createTransport({
            host: 'smtp.sendgrid.net',
            port: 587,
            auth: {
              user: 'apikey',
              pass: config.email.sendgrid.apiKey
            }
          });
          break;

        case 'ses':
          // AWS SES configuration
          const aws = require('aws-sdk');
          aws.config.update({
            region: config.email.ses.region,
            accessKeyId: config.email.ses.accessKeyId,
            secretAccessKey: config.email.ses.secretAccessKey
          });
          this.transporter = nodemailer.createTransport({
            SES: new aws.SES({ apiVersion: '2010-12-01' })
          });
          break;

        default:
          logger.warn('Unknown email provider, falling back to SMTP');
          this.transporter = nodemailer.createTransport({
            host: config.email.smtp.host,
            port: config.email.smtp.port,
            secure: config.email.smtp.secure,
            auth: {
              user: config.email.smtp.auth.user,
              pass: config.email.smtp.auth.pass
            }
          });
      }

      logger.info('Email transporter initialized', { provider });
    } catch (error) {
      logger.error('Error initializing email transporter', {
        error: error.message
      });
    }
  }

  /**
   * Send email
   */
  async sendEmail({
    to,
    subject,
    body = null,
    html = null,
    template = null,
    variables = {},
    notificationId = null
  }) {
    try {
      // Validate email address
      if (!this.validateEmailAddress(to)) {
        throw new Error('Invalid email address');
      }

      let emailBody = body;
      let emailHtml = html;

      // Render template if provided
      if (template) {
        const rendered = await this.renderTemplate(template, variables);
        emailBody = rendered.body;
        emailHtml = rendered.html;
        subject = rendered.subject || subject;
      }

      // Create delivery log
      let deliveryLog = null;
      if (notificationId) {
        deliveryLog = await DeliveryLog.create({
          notificationId,
          channel: 'email',
          provider: config.email.provider || 'smtp',
          status: 'pending'
        });
      }

      // Send email
      const info = await this.transporter.sendMail({
        from: config.email.from,
        to,
        subject,
        text: emailBody,
        html: emailHtml || emailBody
      });

      // Update delivery log
      if (deliveryLog) {
        await deliveryLog.update({
          status: 'sent',
          sentAt: new Date(),
          metadata: {
            messageId: info.messageId,
            response: info.response
          }
        });
      }

      logger.info('Email sent successfully', {
        to,
        subject,
        messageId: info.messageId
      });

      return {
        success: true,
        messageId: info.messageId,
        deliveryLogId: deliveryLog?.id
      };
    } catch (error) {
      logger.error('Error sending email', {
        error: error.message,
        to,
        subject
      });

      // Update delivery log on failure
      if (notificationId) {
        await DeliveryLog.update(
          {
            status: 'failed',
            error: error.message
          },
          {
            where: { notificationId, channel: 'email' }
          }
        );
      }

      throw error;
    }
  }

  /**
   * Render email template with variables
   */
  async renderTemplate(templateName, variables) {
    try {
      const template = await templateService.getTemplate(templateName, 'email');

      if (!template) {
        throw new Error(`Template not found: ${templateName}`);
      }

      // Compile subject and body with Handlebars
      const subjectTemplate = Handlebars.compile(template.subject || '');
      const bodyTemplate = Handlebars.compile(template.body);

      const subject = subjectTemplate(variables);
      const body = bodyTemplate(variables);

      // Convert to HTML (basic conversion)
      const html = body.replace(/\n/g, '<br>');

      return { subject, body, html };
    } catch (error) {
      logger.error('Error rendering email template', {
        error: error.message,
        templateName
      });
      throw error;
    }
  }

  /**
   * Validate email address
   */
  validateEmailAddress(email) {
    return validator.isEmail(email);
  }

  /**
   * Track email opens (webhook handler)
   */
  async trackEmailOpens(notificationId) {
    try {
      await DeliveryLog.update(
        {
          status: 'delivered',
          deliveredAt: new Date()
        },
        {
          where: {
            notificationId,
            channel: 'email',
            status: 'sent'
          }
        }
      );

      logger.info('Email open tracked', { notificationId });
      return { success: true };
    } catch (error) {
      logger.error('Error tracking email open', {
        error: error.message,
        notificationId
      });
      throw error;
    }
  }

  /**
   * Send test email
   */
  async sendTestEmail(to, templateName = null) {
    try {
      const subject = 'Test Email from Exprsn Herald';
      const body = templateName
        ? `This is a test email using template: ${templateName}`
        : 'This is a test email from Exprsn Herald notification service.';

      const variables = {
        userName: 'Test User',
        userEmail: to,
        resetLink: 'https://example.com/reset',
        expiryMinutes: 30
      };

      return await this.sendEmail({
        to,
        subject,
        body,
        template: templateName,
        variables
      });
    } catch (error) {
      logger.error('Error sending test email', {
        error: error.message,
        to
      });
      throw error;
    }
  }

  /**
   * Verify transporter connection
   */
  async verifyConnection() {
    try {
      if (!this.transporter) {
        throw new Error('Transporter not initialized');
      }

      await this.transporter.verify();
      logger.info('Email transporter connection verified');
      return { success: true };
    } catch (error) {
      logger.error('Email transporter connection failed', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new EmailService();
