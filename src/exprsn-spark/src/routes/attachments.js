/**
 * Attachment Routes
 * File upload and management
 */

const express = require('express');
const multer = require('multer');
const { createLogger } = require('@exprsn/shared');
const { requireAuth } = require('../middleware/auth');
const { uploadRateLimit } = require('../middleware/rateLimit');
const uploadService = require('../services/uploadService');
const { addFileProcessingJob } = require('../services/queueService');
const db = require('../models');

const router = express.Router();
const logger = createLogger('exprsn-spark:attachments');

const { Attachment, Message, Participant } = db;

// Multer configuration for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max
  }
});

/**
 * POST /api/attachments/upload
 * Upload file attachment
 */
router.post('/upload',
  requireAuth,
  uploadRateLimit,
  upload.single('file'),
  async (req, res) => {
    try {
      const { messageId, conversationId } = req.body;
      const userId = req.user.id;

      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      if (!messageId) {
        return res.status(400).json({ error: 'Message ID is required' });
      }

      // Verify message exists and user has access
      const message = await Message.findByPk(messageId, {
        include: [{
          model: db.Conversation,
          as: 'conversation'
        }]
      });

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Verify user is participant
      const participant = await Participant.findOne({
        where: {
          conversationId: message.conversationId,
          userId
        }
      });

      if (!participant) {
        return res.status(403).json({ error: 'Not a participant in this conversation' });
      }

      // Upload attachment
      const attachment = await uploadService.uploadAttachment(
        req.file,
        messageId,
        userId,
        message.conversationId
      );

      // Queue file processing job if needed
      if (['video', 'audio'].includes(attachment.metadata.fileType)) {
        await addFileProcessingJob(attachment);
      }

      logger.info('Attachment uploaded', {
        attachmentId: attachment.id,
        messageId,
        userId,
        fileName: req.file.originalname
      });

      res.status(201).json({
        attachment: {
          id: attachment.id,
          fileName: attachment.originalName,
          mimeType: attachment.mimeType,
          fileSize: attachment.fileSize,
          fileUrl: attachment.fileUrl,
          thumbnailUrl: attachment.thumbnailUrl,
          dimensions: attachment.dimensions,
          status: attachment.status
        }
      });
    } catch (error) {
      logger.error('Failed to upload attachment', {
        error: error.message,
        userId: req.user?.id
      });

      if (error.message.includes('Unsupported file type')) {
        return res.status(400).json({ error: error.message });
      }

      if (error.message.includes('File too large')) {
        return res.status(413).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to upload attachment' });
    }
  }
);

/**
 * GET /api/attachments/:id
 * Get attachment details
 */
router.get('/:id',
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const attachment = await Attachment.findByPk(id, {
        include: [{
          model: Message,
          as: 'message',
          include: [{
            model: db.Conversation,
            as: 'conversation'
          }]
        }]
      });

      if (!attachment) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      // Verify user is participant
      const participant = await Participant.findOne({
        where: {
          conversationId: attachment.message.conversationId,
          userId
        }
      });

      if (!participant) {
        return res.status(403).json({ error: 'Not authorized to view this attachment' });
      }

      res.json({
        attachment: {
          id: attachment.id,
          messageId: attachment.messageId,
          fileName: attachment.originalName,
          mimeType: attachment.mimeType,
          fileSize: attachment.fileSize,
          fileUrl: attachment.fileUrl,
          thumbnailUrl: attachment.thumbnailUrl,
          dimensions: attachment.dimensions,
          duration: attachment.duration,
          status: attachment.status,
          createdAt: attachment.createdAt
        }
      });
    } catch (error) {
      logger.error('Failed to get attachment', {
        attachmentId: req.params.id,
        error: error.message
      });
      res.status(500).json({ error: 'Failed to get attachment' });
    }
  }
);

/**
 * GET /api/attachments/:id/download
 * Get signed download URL for attachment
 */
router.get('/:id/download',
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const attachment = await Attachment.findByPk(id, {
        include: [{
          model: Message,
          as: 'message',
          include: [{
            model: db.Conversation,
            as: 'conversation'
          }]
        }]
      });

      if (!attachment) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      // Verify user is participant
      const participant = await Participant.findOne({
        where: {
          conversationId: attachment.message.conversationId,
          userId
        }
      });

      if (!participant) {
        return res.status(403).json({ error: 'Not authorized to download this attachment' });
      }

      // Get signed download URL
      const downloadUrl = await uploadService.getAttachmentUrl(id, userId);

      res.json({
        downloadUrl,
        fileName: attachment.originalName,
        expiresIn: 3600 // 1 hour
      });
    } catch (error) {
      logger.error('Failed to get download URL', {
        attachmentId: req.params.id,
        error: error.message
      });
      res.status(500).json({ error: 'Failed to get download URL' });
    }
  }
);

/**
 * DELETE /api/attachments/:id
 * Delete attachment
 */
router.delete('/:id',
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const attachment = await Attachment.findByPk(id, {
        include: [{
          model: Message,
          as: 'message',
          include: [{
            model: db.Conversation,
            as: 'conversation'
          }]
        }]
      });

      if (!attachment) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      // Only message sender can delete attachment
      if (attachment.message.senderId !== userId) {
        return res.status(403).json({ error: 'Not authorized to delete this attachment' });
      }

      // Delete attachment
      await uploadService.deleteAttachment(id, userId);

      logger.info('Attachment deleted', {
        attachmentId: id,
        userId
      });

      res.json({ success: true, message: 'Attachment deleted' });
    } catch (error) {
      logger.error('Failed to delete attachment', {
        attachmentId: req.params.id,
        error: error.message
      });
      res.status(500).json({ error: 'Failed to delete attachment' });
    }
  }
);

/**
 * GET /api/conversations/:conversationId/attachments
 * List all attachments in a conversation
 */
router.get('/conversations/:conversationId/attachments',
  requireAuth,
  async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;
      const { type, limit = 50, offset = 0 } = req.query;

      // Verify user is participant
      const participant = await Participant.findOne({
        where: {
          conversationId,
          userId
        }
      });

      if (!participant) {
        return res.status(403).json({ error: 'Not a participant in this conversation' });
      }

      // Build query
      const where = {};
      if (type) {
        where['$message.conversationId$'] = conversationId;
        where.mimeType = { [db.Sequelize.Op.like]: `${type}/%` };
      }

      // Get attachments
      const attachments = await Attachment.findAll({
        where,
        include: [{
          model: Message,
          as: 'message',
          where: { conversationId },
          attributes: ['id', 'senderId', 'createdAt']
        }],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        attachments: attachments.map(att => ({
          id: att.id,
          messageId: att.messageId,
          fileName: att.originalName,
          mimeType: att.mimeType,
          fileSize: att.fileSize,
          thumbnailUrl: att.thumbnailUrl,
          dimensions: att.dimensions,
          createdAt: att.createdAt,
          sender: att.message.senderId
        })),
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: attachments.length
        }
      });
    } catch (error) {
      logger.error('Failed to list attachments', {
        conversationId: req.params.conversationId,
        error: error.message
      });
      res.status(500).json({ error: 'Failed to list attachments' });
    }
  }
);

module.exports = router;
