const express = require('express');
const router = express.Router();
const multer = require('multer');
const { asyncHandler } = require('@exprsn/shared');
const sessionService = require('../services/sessionService');
const filevaultIntegration = require('../services/integrations/filevaultIntegration');
const { Blob } = require('../models');
const crypto = require('crypto');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

/**
 * Middleware to validate session token
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  const accessToken = req.headers['authorization']?.replace('Bearer ', '');

  if (!accessToken) {
    return res.status(401).json({
      error: 'AuthRequired',
      message: 'Authorization required'
    });
  }

  const session = await sessionService.validateToken(accessToken);

  if (!session) {
    return res.status(401).json({
      error: 'InvalidToken',
      message: 'Invalid or expired token'
    });
  }

  req.session = session;
  next();
});

/**
 * XRPC: Upload blob
 * POST /xrpc/com.atproto.repo.uploadBlob
 */
router.post('/com.atproto.repo.uploadBlob',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: 'InvalidRequest',
        message: 'File is required'
      });
    }

    const file = req.file;

    // Validate file type
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/mpeg',
      'video/webm'
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({
        error: 'InvalidRequest',
        message: 'Unsupported file type'
      });
    }

    // Generate blob CID
    const hash = crypto.createHash('sha256');
    hash.update(file.buffer);
    const cid = `baf${hash.digest('hex').substring(0, 56)}`;

    // Upload to FileVault
    const uploadResult = await filevaultIntegration.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      req.session.exprsnUserId
    );

    // Store blob record
    const blob = await Blob.create({
      cid,
      did: req.session.did,
      mimeType: file.mimetype,
      size: file.size,
      filevaultUrl: uploadResult.url,
      filevaultFileId: uploadResult.fileId
    });

    res.json({
      blob: {
        $type: 'blob',
        ref: {
          $link: cid
        },
        mimeType: file.mimetype,
        size: file.size
      }
    });
  })
);

/**
 * XRPC: Get blob
 * GET /xrpc/com.atproto.sync.getBlob
 */
router.get('/com.atproto.sync.getBlob', asyncHandler(async (req, res) => {
  const { did, cid } = req.query;

  if (!did || !cid) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'DID and CID parameters required'
    });
  }

  // Find blob
  const blob = await Blob.findOne({
    where: { cid, did }
  });

  if (!blob) {
    return res.status(404).json({
      error: 'BlobNotFound',
      message: 'Blob not found'
    });
  }

  // Get blob from FileVault
  const fileData = await filevaultIntegration.downloadFile(blob.filevaultFileId);

  // Set appropriate headers
  res.set('Content-Type', blob.mimeType);
  res.set('Content-Length', blob.size);
  res.set('Cache-Control', 'public, max-age=31536000');

  res.send(fileData);
}));

module.exports = router;
