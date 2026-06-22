/**
 * Upload Service
 * Handles file uploads with FileVault integration
 */

const axios = require('axios');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { createLogger } = require('@exprsn/shared');
const db = require('../models');

const logger = createLogger('exprsn-spark:upload');

const { Attachment } = db;

// FileVault service URL
const FILEVAULT_URL = process.env.FILEVAULT_SERVICE_URL || 'http://localhost:3007';

// Allowed file types
const ALLOWED_MIME_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
};

// Max file sizes (in bytes)
const MAX_FILE_SIZES = {
  image: 10 * 1024 * 1024, // 10MB
  video: 100 * 1024 * 1024, // 100MB
  audio: 25 * 1024 * 1024, // 25MB
  document: 25 * 1024 * 1024 // 25MB
};

/**
 * Validate file upload
 */
function validateFileUpload(file) {
  if (!file) {
    throw new Error('No file provided');
  }

  const { mimetype, size } = file;

  // Check mime type
  let fileType = null;
  for (const [type, mimes] of Object.entries(ALLOWED_MIME_TYPES)) {
    if (mimes.includes(mimetype)) {
      fileType = type;
      break;
    }
  }

  if (!fileType) {
    throw new Error(`Unsupported file type: ${mimetype}`);
  }

  // Check file size
  if (size > MAX_FILE_SIZES[fileType]) {
    throw new Error(`File too large. Maximum size for ${fileType} is ${MAX_FILE_SIZES[fileType] / 1024 / 1024}MB`);
  }

  return { fileType, mimetype, size };
}

/**
 * Upload file to FileVault
 */
async function uploadToFileVault(file, userId, conversationId) {
  try {
    const formData = new FormData();
    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype
    });
    formData.append('userId', userId);
    formData.append('context', 'spark-message');
    formData.append('conversationId', conversationId);

    const response = await axios.post(`${FILEVAULT_URL}/api/files/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${process.env.SERVICE_CA_TOKEN}`
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    return response.data;
  } catch (error) {
    logger.error('Failed to upload to FileVault', {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    throw new Error('Failed to upload file to storage');
  }
}

/**
 * Generate image thumbnail
 */
async function generateImageThumbnail(buffer) {
  try {
    const thumbnail = await sharp(buffer)
      .resize(300, 300, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    return thumbnail;
  } catch (error) {
    logger.error('Failed to generate thumbnail', { error: error.message });
    throw error;
  }
}

/**
 * Get image dimensions
 */
async function getImageDimensions(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width,
      height: metadata.height
    };
  } catch (error) {
    logger.error('Failed to get image dimensions', { error: error.message });
    return null;
  }
}

/**
 * Upload attachment
 */
async function uploadAttachment(file, messageId, userId, conversationId) {
  try {
    // Validate file
    const { fileType, mimetype, size } = validateFileUpload(file);

    logger.info('Uploading attachment', {
      messageId,
      fileName: file.originalname,
      fileType,
      size
    });

    // Upload to FileVault
    const fileVaultResult = await uploadToFileVault(file, userId, conversationId);

    // Process media if needed
    let thumbnailUrl = null;
    let dimensions = null;

    if (fileType === 'image') {
      dimensions = await getImageDimensions(file.buffer);

      // Generate and upload thumbnail
      const thumbnail = await generateImageThumbnail(file.buffer);
      const thumbnailFile = {
        buffer: thumbnail,
        originalname: `thumb_${file.originalname}`,
        mimetype: 'image/jpeg'
      };
      const thumbnailResult = await uploadToFileVault(thumbnailFile, userId, conversationId);
      thumbnailUrl = thumbnailResult.fileUrl;
    }

    // Create attachment record
    const attachment = await Attachment.create({
      messageId,
      fileName: fileVaultResult.fileId,
      originalName: file.originalname,
      mimeType: mimetype,
      fileSize: size,
      fileUrl: fileVaultResult.fileUrl,
      thumbnailUrl,
      dimensions,
      status: 'ready',
      metadata: {
        fileVaultId: fileVaultResult.fileId,
        fileType
      }
    });

    logger.info('Attachment created', {
      attachmentId: attachment.id,
      messageId,
      fileType
    });

    return attachment;
  } catch (error) {
    logger.error('Failed to upload attachment', {
      messageId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get attachment URL (signed)
 */
async function getAttachmentUrl(attachmentId, userId) {
  try {
    const attachment = await Attachment.findByPk(attachmentId);
    if (!attachment) {
      throw new Error('Attachment not found');
    }

    // Get signed URL from FileVault
    const response = await axios.get(
      `${FILEVAULT_URL}/api/files/${attachment.metadata.fileVaultId}/download`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.SERVICE_CA_TOKEN}`
        }
      }
    );

    return response.data.downloadUrl;
  } catch (error) {
    logger.error('Failed to get attachment URL', {
      attachmentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete attachment
 */
async function deleteAttachment(attachmentId, userId) {
  try {
    const attachment = await Attachment.findByPk(attachmentId);
    if (!attachment) {
      throw new Error('Attachment not found');
    }

    // Delete from FileVault
    await axios.delete(
      `${FILEVAULT_URL}/api/files/${attachment.metadata.fileVaultId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.SERVICE_CA_TOKEN}`
        }
      }
    );

    // Delete thumbnail if exists
    if (attachment.thumbnailUrl) {
      try {
        await axios.delete(
          `${FILEVAULT_URL}/api/files/${attachment.metadata.thumbnailFileVaultId}`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.SERVICE_CA_TOKEN}`
            }
          }
        );
      } catch (err) {
        logger.warn('Failed to delete thumbnail', { error: err.message });
      }
    }

    // Delete attachment record
    await attachment.destroy();

    logger.info('Attachment deleted', { attachmentId });
    return true;
  } catch (error) {
    logger.error('Failed to delete attachment', {
      attachmentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Process media (for background jobs)
 */
async function processMedia({ attachmentId, messageId, fileName, mimeType, fileUrl }) {
  try {
    logger.info('Processing media', { attachmentId, mimeType });

    const attachment = await Attachment.findByPk(attachmentId);
    if (!attachment) {
      throw new Error('Attachment not found');
    }

    // Update status to processing
    await attachment.update({ status: 'processing' });

    // For video files, could generate thumbnails, transcode, etc.
    // For now, just mark as ready
    await attachment.update({ status: 'ready' });

    logger.info('Media processed', { attachmentId });
    return { success: true, attachmentId };
  } catch (error) {
    logger.error('Failed to process media', {
      attachmentId,
      error: error.message
    });

    // Update attachment status to failed
    const attachment = await Attachment.findByPk(attachmentId);
    if (attachment) {
      await attachment.update({ status: 'failed' });
    }

    throw error;
  }
}

module.exports = {
  validateFileUpload,
  uploadAttachment,
  getAttachmentUrl,
  deleteAttachment,
  processMedia,
  generateImageThumbnail,
  getImageDimensions
};
