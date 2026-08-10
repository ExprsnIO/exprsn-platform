/**
 * ═══════════════════════════════════════════════════════════════════════
 * File Upload Middleware
 * ═══════════════════════════════════════════════════════════════════════
 */

const multer = require('multer');
const config = require('../config');
const logger = require('../utils/logger');

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
  // Add any file type restrictions here if needed
  cb(null, true);
};

// Create multer upload instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: config.app.maxFileSize,
    files: 1 // Single file upload
  }
});

/**
 * Single file upload middleware
 */
const uploadSingle = upload.single('file');

/**
 * Upload error handler
 */
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    logger.error('Multer error:', err);

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'FILE_TOO_LARGE',
        message: `File size exceeds maximum allowed size of ${config.app.maxFileSize} bytes`,
        maxSize: config.app.maxFileSize
      });
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'TOO_MANY_FILES',
        message: 'Only one file can be uploaded at a time'
      });
    }

    return res.status(400).json({
      error: 'UPLOAD_ERROR',
      message: err.message
    });
  }

  if (err) {
    logger.error('Upload error:', err);
    return res.status(500).json({
      error: 'UPLOAD_FAILED',
      message: 'File upload failed'
    });
  }

  next();
}

/**
 * Validate uploaded file
 */
function validateFile(req, res, next) {
  if (!req.file) {
    return res.status(400).json({
      error: 'NO_FILE',
      message: 'No file was uploaded'
    });
  }

  // Add additional validation logic here
  // e.g., virus scanning, content type verification, etc.

  next();
}

module.exports = {
  uploadSingle,
  handleUploadError,
  validateFile
};
