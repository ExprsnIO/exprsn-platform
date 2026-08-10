/**
 * Exprsn Herald - Notification Templates Routes
 */

const express = require('express');
const router = express.Router();
const templateService = require('../services/templateService');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  validateCreateTemplate,
  validateUpdateTemplate,
  validateSendTestEmail,
  validateSendTestSMS
} = require('../middleware/validation');
const logger = require('../utils/logger');

/**
 * GET /api/templates
 * List templates (admin only)
 */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { channel = null, active = null, limit = 50, offset = 0 } = req.query;

    const result = await templateService.listTemplates({
      channel,
      active: active !== null ? active === 'true' : null,
      limit,
      offset
    });

    res.json(result);
  } catch (error) {
    logger.error('Error listing templates', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/templates/:id
 * Get template by ID
 */
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const template = await templateService.getTemplateById(id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ template });
  } catch (error) {
    logger.error('Error getting template', {
      error: error.message,
      templateId: req.params.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/templates
 * Create template (admin only)
 */
router.post('/', requireAdmin, validateCreateTemplate, async (req, res) => {
  try {
    const { name, channel, subject, body, variables, active } = req.body;

    const template = await templateService.createTemplate({
      name,
      channel,
      subject,
      body,
      variables,
      active
    });

    res.status(201).json({
      success: true,
      template
    });
  } catch (error) {
    logger.error('Error creating template', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/templates/:id
 * Update template (admin only)
 */
router.put('/:id', requireAdmin, validateUpdateTemplate, async (req, res) => {
  try {
    const { id } = req.params;
    const template = await templateService.updateTemplate(id, req.body);

    res.json({
      success: true,
      template
    });
  } catch (error) {
    logger.error('Error updating template', {
      error: error.message,
      templateId: req.params.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/templates/:id
 * Delete template (admin only) - soft delete
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await templateService.deleteTemplate(id);

    res.json({
      success: true,
      message: 'Template deleted'
    });
  } catch (error) {
    logger.error('Error deleting template', {
      error: error.message,
      templateId: req.params.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/templates/:id/duplicate
 * Duplicate template (admin only)
 */
router.post('/:id/duplicate', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newName } = req.body;

    if (!newName) {
      return res.status(400).json({
        error: 'newName is required'
      });
    }

    const template = await templateService.duplicateTemplate(id, newName);

    res.status(201).json({
      success: true,
      template
    });
  } catch (error) {
    logger.error('Error duplicating template', {
      error: error.message,
      templateId: req.params.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/templates/:id/test
 * Send test notification using template (admin only)
 */
router.post('/:id/test', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { variables = {}, recipient } = req.body;

    const template = await templateService.getTemplateById(id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (!recipient) {
      return res.status(400).json({
        error: 'recipient is required (email or phone number)'
      });
    }

    let result;

    switch (template.channel) {
      case 'email':
        result = await emailService.sendEmail({
          to: recipient,
          template: template.name,
          variables
        });
        break;

      case 'sms':
        const body = templateService.renderTemplate(template.body, variables);
        result = await smsService.sendSMS({
          to: recipient,
          body
        });
        break;

      case 'push':
      case 'in-app':
        return res.status(400).json({
          error: `Cannot send test for ${template.channel} channel via this endpoint`
        });

      default:
        return res.status(400).json({
          error: 'Invalid template channel'
        });
    }

    res.json({
      success: true,
      message: `Test ${template.channel} notification sent`,
      result
    });
  } catch (error) {
    logger.error('Error sending test notification', {
      error: error.message,
      templateId: req.params.id
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/templates/test/email
 * Send test email (admin only)
 */
router.post('/test/email', requireAdmin, validateSendTestEmail, async (req, res) => {
  try {
    const { to, templateName } = req.body;

    const result = await emailService.sendTestEmail(to, templateName);

    res.json({
      success: true,
      message: 'Test email sent',
      result
    });
  } catch (error) {
    logger.error('Error sending test email', {
      error: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/templates/test/sms
 * Send test SMS (admin only)
 */
router.post('/test/sms', requireAdmin, validateSendTestSMS, async (req, res) => {
  try {
    const { to } = req.body;

    const result = await smsService.sendTestSMS(to);

    res.json({
      success: true,
      message: 'Test SMS sent',
      result
    });
  } catch (error) {
    logger.error('Error sending test SMS', {
      error: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/templates/validate
 * Validate template variables (admin only)
 */
router.post('/validate', requireAdmin, async (req, res) => {
  try {
    const { templateBody, variables } = req.body;

    if (!templateBody) {
      return res.status(400).json({
        error: 'templateBody is required'
      });
    }

    const validation = templateService.validateTemplateVariables(
      templateBody,
      variables || {}
    );

    res.json({
      valid: validation.valid,
      required: validation.required,
      missing: validation.missing
    });
  } catch (error) {
    logger.error('Error validating template', {
      error: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
