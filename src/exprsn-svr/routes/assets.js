/**
 * ═══════════════════════════════════════════════════════════
 * Asset Routes
 * API endpoints for media and file asset management
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const assetService = require('../services/assetService');
const { requireAuth } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') // 10MB default
  }
});

/**
 * @route   GET /api/assets
 * @desc    List all assets with optional filters
 * @access  Private
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const filters = {
      pageId: req.query.pageId,
      uploadedBy: req.query.uploadedBy || req.user.id,
      fileType: req.query.fileType,
      isPublic: req.query.isPublic === 'true' ? true : req.query.isPublic === 'false' ? false : undefined,
      tags: req.query.tags ? req.query.tags.split(',') : undefined,
      orderBy: req.query.orderBy || 'created_at',
      orderDirection: req.query.orderDirection || 'DESC',
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0
    };

    const assets = await assetService.listAssets(filters);

    res.json({
      success: true,
      count: assets.length,
      data: assets
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/assets/search
 * @desc    Search assets by keyword
 * @access  Private
 */
router.get('/search', requireAuth, async (req, res, next) => {
  try {
    const keyword = req.query.q || req.query.keyword;
    if (!keyword) {
      return res.status(400).json({
        success: false,
        error: 'Search keyword is required'
      });
    }

    const filters = {
      fileType: req.query.fileType,
      uploadedBy: req.user.id,
      isPublic: req.query.isPublic === 'true' ? true : undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0
    };

    const assets = await assetService.searchAssets(keyword, filters);

    res.json({
      success: true,
      count: assets.length,
      data: assets
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/assets/stats
 * @desc    Get storage statistics for current user
 * @access  Private
 */
router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const stats = await assetService.getUserStorageStats(req.user.id);
    const statsByType = await assetService.getStorageStatsByType(req.user.id);

    res.json({
      success: true,
      data: {
        overall: stats,
        byType: statsByType
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/assets/page/:pageId
 * @desc    Get all assets for a specific page
 * @access  Private
 */
router.get('/page/:pageId', requireAuth, async (req, res, next) => {
  try {
    const assets = await assetService.getPageAssets(req.params.pageId, req.user.id);

    res.json({
      success: true,
      count: assets.length,
      data: assets
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/assets/:id
 * @desc    Get asset by ID
 * @access  Private (or public if asset is public)
 */
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const asset = await assetService.getAsset(req.params.id, userId);

    res.json({
      success: true,
      data: asset
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/assets/:id/download
 * @desc    Download asset file
 * @access  Private (or public if asset is public)
 */
router.get('/:id/download', async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const asset = await assetService.getAsset(req.params.id, userId);
    const filePath = assetService.getAssetFilePath(asset);

    res.download(filePath, asset.file_name);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/assets/upload
 * @desc    Upload a new asset
 * @access  Private
 */
router.post('/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('No file provided', 400);
    }

    const options = {
      pageId: req.body.pageId,
      altText: req.body.altText,
      title: req.body.title,
      description: req.body.description,
      tags: req.body.tags ? JSON.parse(req.body.tags) : [],
      isPublic: req.body.isPublic === 'true'
    };

    const asset = await assetService.uploadFile(req.file, req.user.id, options);

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      data: asset
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/assets/upload/multiple
 * @desc    Upload multiple assets
 * @access  Private
 */
router.post('/upload/multiple', requireAuth, upload.array('files', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new AppError('No files provided', 400);
    }

    const options = {
      pageId: req.body.pageId,
      isPublic: req.body.isPublic === 'true'
    };

    const uploadedAssets = [];
    const errors = [];

    for (const file of req.files) {
      try {
        const asset = await assetService.uploadFile(file, req.user.id, options);
        uploadedAssets.push(asset);
      } catch (error) {
        errors.push({
          filename: file.originalname,
          error: error.message
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `${uploadedAssets.length} files uploaded successfully`,
      data: uploadedAssets,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/assets/:id
 * @desc    Update asset metadata
 * @access  Private (owner only)
 */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const asset = await assetService.updateAsset(
      req.params.id,
      req.body,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Asset updated successfully',
      data: asset
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/assets/:id
 * @desc    Delete asset
 * @access  Private (owner only)
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await assetService.deleteAsset(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Asset deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
