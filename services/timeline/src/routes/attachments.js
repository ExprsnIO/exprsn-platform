/**
 * ═══════════════════════════════════════════════════════════
 * Attachment Routes
 * File attachment management for posts and comments
 * Integrates with exprsn-filevault for storage
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const multer = require('multer');
const { asyncHandler, AppError, validateRequired } = require('@exprsn/shared');
const { createAttachmentService } = require('@exprsn/shared/services/attachmentService');
const { requireToken, requireWrite, requireDelete } = require('../middleware/auth');
const { validateUUID } = require('../middleware/validation');
const { Attachment, Post, Comment } = require('../models');

const router = express.Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max
    files: 10 // Max 10 files per request
  }
});

// Initialize attachment service
const attachmentService = createAttachmentService({
  serviceName: 'exprsn-timeline',
  fileVaultUrl: process.env.FILEVAULT_BASE_URL || 'http://localhost:3007',
  serviceToken: process.env.SERVICE_TOKEN
});

// All attachment routes require authentication
router.use(requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/attachments' }));

/**
 * POST /api/attachments/posts/:postId
 * Upload files to a post
 */
router.post('/posts/:postId',
  validateUUID('postId'),
  requireWrite('/attachments'),
  upload.array('files', 10),
  asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      throw new AppError('No files provided', 400, 'VALIDATION_ERROR');
    }

    // Verify post exists and user has access
    const post = await Post.findOne({
      where: { id: postId, deleted: false }
    });

    if (!post) {
      throw new AppError('Post not found', 404, 'NOT_FOUND');
    }

    if (post.userId !== req.userId) {
      throw new AppError('Not authorized to add attachments to this post', 403, 'FORBIDDEN');
    }

    // Upload files to FileVault
    const uploadedFiles = await attachmentService.uploadMultipleFiles(files, {
      userId: req.userId,
      visibility: post.visibility === 'public' ? 'public' : 'private',
      tags: ['timeline', 'post', postId]
    });

    // Create attachment records
    const attachments = await Attachment.bulkCreateFromFiles(
      uploadedFiles,
      'post',
      postId,
      req.userId
    );

    res.status(201).json({
      success: true,
      message: `${attachments.length} file(s) attached to post`,
      attachments: attachments.map(a => a.toPublicJSON())
    });
  })
);

/**
 * POST /api/attachments/comments/:commentId
 * Upload files to a comment
 */
router.post('/comments/:commentId',
  validateUUID('commentId'),
  requireWrite('/attachments'),
  upload.array('files', 10),
  asyncHandler(async (req, res) => {
    const { commentId } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      throw new AppError('No files provided', 400, 'VALIDATION_ERROR');
    }

    // Verify comment exists and user has access
    const comment = await Comment.findOne({
      where: { id: commentId, deleted: false }
    });

    if (!comment) {
      throw new AppError('Comment not found', 404, 'NOT_FOUND');
    }

    if (comment.userId !== req.userId) {
      throw new AppError('Not authorized to add attachments to this comment', 403, 'FORBIDDEN');
    }

    // Upload files to FileVault
    const uploadedFiles = await attachmentService.uploadMultipleFiles(files, {
      userId: req.userId,
      visibility: 'private', // Comments default to private
      tags: ['timeline', 'comment', commentId]
    });

    // Create attachment records
    const attachments = await Attachment.bulkCreateFromFiles(
      uploadedFiles,
      'comment',
      commentId,
      req.userId
    );

    res.status(201).json({
      success: true,
      message: `${attachments.length} file(s) attached to comment`,
      attachments: attachments.map(a => a.toPublicJSON())
    });
  })
);

/**
 * GET /api/attachments/posts/:postId
 * Get all attachments for a post
 */
router.get('/posts/:postId',
  validateUUID('postId'),
  asyncHandler(async (req, res) => {
    const { postId } = req.params;

    // Verify post exists
    const post = await Post.findOne({
      where: { id: postId, deleted: false }
    });

    if (!post) {
      throw new AppError('Post not found', 404, 'NOT_FOUND');
    }

    // Check visibility
    if (post.visibility === 'private' && post.userId !== req.userId) {
      throw new AppError('This post is private', 403, 'FORBIDDEN');
    }

    const attachments = await Attachment.findByEntity('post', postId);

    res.json({
      success: true,
      attachments: attachments.map(a => a.toPublicJSON()),
      count: attachments.length
    });
  })
);

/**
 * GET /api/attachments/comments/:commentId
 * Get all attachments for a comment
 */
router.get('/comments/:commentId',
  validateUUID('commentId'),
  asyncHandler(async (req, res) => {
    const { commentId } = req.params;

    const attachments = await Attachment.findByEntity('comment', commentId);

    res.json({
      success: true,
      attachments: attachments.map(a => a.toPublicJSON()),
      count: attachments.length
    });
  })
);

/**
 * GET /api/attachments/:id
 * Get single attachment details
 */
router.get('/:id',
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const attachment = await Attachment.findByPk(req.params.id);

    if (!attachment) {
      throw new AppError('Attachment not found', 404, 'NOT_FOUND');
    }

    // Check access based on entity type
    let hasAccess = false;

    if (attachment.entityType === 'post') {
      const post = await Post.findByPk(attachment.entityId);
      hasAccess = post && (
        post.visibility === 'public' ||
        post.userId === req.userId
      );
    } else if (attachment.entityType === 'comment') {
      const comment = await Comment.findByPk(attachment.entityId);
      hasAccess = comment && (comment.userId === req.userId);
    }

    if (!hasAccess) {
      throw new AppError('Access denied', 403, 'FORBIDDEN');
    }

    res.json({
      success: true,
      attachment: attachment.toPublicJSON()
    });
  })
);

/**
 * PUT /api/attachments/:id
 * Update attachment metadata (description, alt text, etc.)
 */
router.put('/:id',
  validateUUID('id'),
  requireWrite('/attachments'),
  asyncHandler(async (req, res) => {
    const { description, altText, isPrimary } = req.body;

    const attachment = await Attachment.findByPk(req.params.id);

    if (!attachment) {
      throw new AppError('Attachment not found', 404, 'NOT_FOUND');
    }

    // Only uploader can update
    if (attachment.uploadedBy !== req.userId) {
      throw new AppError('Not authorized to update this attachment', 403, 'FORBIDDEN');
    }

    // Update allowed fields
    if (description !== undefined) attachment.description = description;
    if (altText !== undefined) attachment.altText = altText;
    if (isPrimary !== undefined) {
      // If setting as primary, unset other primary attachments
      if (isPrimary) {
        await Attachment.update(
          { isPrimary: false },
          {
            where: {
              entityType: attachment.entityType,
              entityId: attachment.entityId,
              isPrimary: true
            }
          }
        );
      }
      attachment.isPrimary = isPrimary;
    }

    await attachment.save();

    res.json({
      success: true,
      message: 'Attachment updated',
      attachment: attachment.toPublicJSON()
    });
  })
);

/**
 * DELETE /api/attachments/:id
 * Delete an attachment
 */
router.delete('/:id',
  validateUUID('id'),
  requireDelete('/attachments'),
  asyncHandler(async (req, res) => {
    const attachment = await Attachment.findByPk(req.params.id);

    if (!attachment) {
      throw new AppError('Attachment not found', 404, 'NOT_FOUND');
    }

    // Only uploader can delete
    if (attachment.uploadedBy !== req.userId) {
      throw new AppError('Not authorized to delete this attachment', 403, 'FORBIDDEN');
    }

    // Soft delete from database
    await attachment.destroy();

    // Optionally delete from FileVault (uncomment if desired)
    // await attachmentService.deleteFile(attachment.fileId);

    res.json({
      success: true,
      message: 'Attachment deleted'
    });
  })
);

/**
 * GET /api/attachments/:id/download
 * Download an attachment file
 */
router.get('/:id/download',
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const attachment = await Attachment.findByPk(req.params.id);

    if (!attachment) {
      throw new AppError('Attachment not found', 404, 'NOT_FOUND');
    }

    // Check access
    let hasAccess = false;

    if (attachment.entityType === 'post') {
      const post = await Post.findByPk(attachment.entityId);
      hasAccess = post && (
        post.visibility === 'public' ||
        post.userId === req.userId
      );
    } else if (attachment.entityType === 'comment') {
      const comment = await Comment.findByPk(attachment.entityId);
      hasAccess = comment && (comment.userId === req.userId);
    }

    if (!hasAccess) {
      throw new AppError('Access denied', 403, 'FORBIDDEN');
    }

    // Redirect to FileVault download URL
    res.redirect(attachment.fileUrl);
  })
);

/**
 * POST /api/attachments/:id/share
 * Create a share link for an attachment
 */
router.post('/:id/share',
  validateUUID('id'),
  asyncHandler(async (req, res) => {
    const { expiresAt, maxDownloads, password } = req.body;

    const attachment = await Attachment.findByPk(req.params.id);

    if (!attachment) {
      throw new AppError('Attachment not found', 404, 'NOT_FOUND');
    }

    // Only uploader can create share links
    if (attachment.uploadedBy !== req.userId) {
      throw new AppError('Not authorized to share this attachment', 403, 'FORBIDDEN');
    }

    const shareLink = await attachmentService.createShareLink(attachment.fileId, {
      expiresAt,
      maxDownloads,
      password
    });

    res.json({
      success: true,
      message: 'Share link created',
      shareLink
    });
  })
);

module.exports = router;
