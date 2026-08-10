const express = require('express');
const router = express.Router();
const { validateToken } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');
const { sequelize } = require('../../../config/database');
const { BusinessForm, FormSubmission } = require('../../models/index');
const { v4: uuidv4 } = require('uuid');

// =============== BUSINESS FORMS ===============

// List forms
router.get('/',  async (req, res) => {
  try {
    const { status, category, isTemplate, limit = 20, offset = 0 } = req.query;

    const where = {};
    if (status) where.status = status;
    if (category) where.category = category;
    if (isTemplate !== undefined) where.isTemplate = isTemplate === 'true';

    const { count, rows: forms } = await BusinessForm.findAndCountAll({
      where,
      attributes: ['id', 'name', 'slug', 'description', 'category', 'status', 'submissionCount', 'createdAt'],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      forms,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('GET /forms failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create form
router.post('/',  async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      category,
      fields,
      layout,
      onSubmitWorkflowId,
      onApproveWorkflowId,
      onRejectWorkflowId,
      parameters,
      parameterSchema,
      visibility,
      allowedRoles,
      allowedUserIds,
      requiresApproval,
      approverRole,
      approverUserIds,
      autoApprovalRules,
      notifyOnSubmit,
      notificationRecipients,
      allowMultipleSubmissions,
      allowDraftSaving,
      allowEditingAfterSubmit,
      successMessage,
      successRedirectUrl,
      customCss,
      status,
      isTemplate
    } = req.body;

    const form = await BusinessForm.create({
      name,
      slug,
      description,
      category,
      fields: fields || [],
      layout: layout || {},
      onSubmitWorkflowId,
      onApproveWorkflowId,
      onRejectWorkflowId,
      parameters: parameters || {},
      parameterSchema: parameterSchema || {},
      visibility: visibility || 'authenticated',
      allowedRoles: allowedRoles || [],
      allowedUserIds: allowedUserIds || [],
      requiresApproval: requiresApproval || false,
      approverRole,
      approverUserIds: approverUserIds || [],
      autoApprovalRules: autoApprovalRules || {},
      notifyOnSubmit: notifyOnSubmit !== false,
      notificationRecipients: notificationRecipients || [],
      allowMultipleSubmissions: allowMultipleSubmissions !== false,
      allowDraftSaving: allowDraftSaving !== false,
      allowEditingAfterSubmit: allowEditingAfterSubmit || false,
      successMessage,
      successRedirectUrl,
      customCss,
      status: status || 'draft',
      isTemplate: isTemplate || false,
      createdById: req.user.id
    });

    res.status(201).json({ success: true, form });
  } catch (error) {
    logger.error('POST /forms failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get form by ID or slug
router.get('/:idOrSlug',  async (req, res) => {
  try {
    const { idOrSlug } = req.params;

    const where = idOrSlug.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      ? { id: idOrSlug }
      : { slug: idOrSlug };

    const form = await BusinessForm.findOne({ where });

    if (!form) {
      return res.status(404).json({ success: false, error: 'Form not found' });
    }

    res.json({ success: true, form });
  } catch (error) {
    logger.error('GET /forms/:idOrSlug failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update form
router.put('/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const form = await BusinessForm.findByPk(id);
    if (!form) {
      return res.status(404).json({ success: false, error: 'Form not found' });
    }

    updates.updatedById = req.user.id;
    await form.update(updates);

    res.json({ success: true, form });
  } catch (error) {
    logger.error('PUT /forms/:id failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// Delete form
router.delete('/:id',  async (req, res) => {
  try {
    const { id } = req.params;

    const form = await BusinessForm.findByPk(id);
    if (!form) {
      return res.status(404).json({ success: false, error: 'Form not found' });
    }

    // Check if form has submissions
    const submissionCount = await FormSubmission.count({ where: { formId: id } });
    if (submissionCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete form with submissions. Archive it instead.'
      });
    }

    await form.destroy();
    res.json({ success: true, message: 'Form deleted successfully' });
  } catch (error) {
    logger.error('DELETE /forms/:id failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// =============== FORM SUBMISSIONS ===============

// List submissions for a form
router.get('/:formId/submissions',  async (req, res) => {
  try {
    const { formId } = req.params;
    const { status, submittedById, limit = 20, offset = 0 } = req.query;

    const where = { formId };
    if (status) where.status = status;
    if (submittedById) where.submittedById = submittedById;

    const { count, rows: submissions } = await FormSubmission.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      submissions,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('GET /forms/:formId/submissions failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create/update submission (save draft or submit)
router.post('/:formId/submissions',  async (req, res) => {
  try {
    const { formId } = req.params;
    const { data, parameters, attachments, status, submissionId } = req.body;

    const form = await BusinessForm.findByPk(formId);
    if (!form) {
      return res.status(404).json({ success: false, error: 'Form not found' });
    }

    // Check if form is active
    if (form.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Form is not active' });
    }

    let submission;

    // Update existing draft or create new submission
    if (submissionId) {
      submission = await FormSubmission.findOne({
        where: {
          id: submissionId,
          formId,
          submittedById: req.user.id
        }
      });

      if (!submission) {
        return res.status(404).json({ success: false, error: 'Submission not found' });
      }

      // Check if editing is allowed
      if (submission.status !== 'draft' && !form.allowEditingAfterSubmit) {
        return res.status(403).json({
          success: false,
          error: 'Editing after submission is not allowed for this form'
        });
      }

      await submission.update({
        data,
        parameters,
        attachments,
        status: status || submission.status,
        submittedAt: status === 'submitted' && !submission.submittedAt ? new Date() : submission.submittedAt,
        lastEditedAt: new Date(),
        editCount: submission.editCount + 1,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } else {
      // Generate reference number
      const referenceNumber = `${form.slug.toUpperCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      submission = await FormSubmission.create({
        formId,
        submittedById: req.user.id,
        data,
        parameters: parameters || {},
        attachments: attachments || [],
        status: status || 'draft',
        submittedAt: status === 'submitted' ? new Date() : null,
        referenceNumber,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      // If submitted (not draft), increment form submission count
      if (status === 'submitted') {
        await form.increment('submissionCount');

        // TODO: Trigger workflow if configured
        if (form.onSubmitWorkflowId) {
          // Integration with workflow service
          logger.info('Workflow trigger needed', {
            workflowId: form.onSubmitWorkflowId,
            submissionId: submission.id
          });
        }

        // TODO: Send notifications if configured
        if (form.notifyOnSubmit && form.notificationRecipients.length > 0) {
          logger.info('Notifications needed', {
            recipients: form.notificationRecipients,
            submissionId: submission.id
          });
        }
      }
    }

    res.status(submissionId ? 200 : 201).json({ success: true, submission });
  } catch (error) {
    logger.error('POST /forms/:formId/submissions failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get submission by ID
router.get('/:formId/submissions/:id',  async (req, res) => {
  try {
    const { formId, id } = req.params;

    const submission = await FormSubmission.findOne({
      where: { id, formId },
      include: [{
        model: BusinessForm,
        as: 'Form',
        attributes: ['id', 'name', 'slug', 'fields', 'layout']
      }]
    });

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    // Check access
    if (submission.submittedById !== req.user.id) {
      // TODO: Check if user is approver or has admin rights
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, submission });
  } catch (error) {
    logger.error('GET /forms/:formId/submissions/:id failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Approve/Reject submission
router.post('/:formId/submissions/:id/review',  async (req, res) => {
  try {
    const { formId, id } = req.params;
    const { status, reviewComments } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const submission = await FormSubmission.findOne({
      where: { id, formId },
      include: [{
        model: BusinessForm,
        as: 'Form'
      }]
    });

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    // TODO: Check if user is authorized approver

    await submission.update({
      status,
      reviewedById: req.user.id,
      reviewedAt: new Date(),
      reviewComments
    });

    // Update form approval rate
    const approvalStats = await FormSubmission.findAll({
      where: { formId, status: { [sequelize.Sequelize.Op.in]: ['approved', 'rejected'] } },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'approved' THEN 1 ELSE 0 END")), 'approved']
      ],
      raw: true
    });

    if (approvalStats[0] && approvalStats[0].total > 0) {
      const approvalRate = (parseFloat(approvalStats[0].approved) / parseFloat(approvalStats[0].total)) * 100;
      await submission.Form.update({ approvalRate: approvalRate.toFixed(2) });
    }

    // TODO: Trigger workflow if configured
    const workflowId = status === 'approved' ? submission.Form.onApproveWorkflowId : submission.Form.onRejectWorkflowId;
    if (workflowId) {
      logger.info('Workflow trigger needed', { workflowId, submissionId: id, status });
    }

    res.json({ success: true, submission });
  } catch (error) {
    logger.error('POST /forms/:formId/submissions/:id/review failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
