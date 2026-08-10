/**
 * ═══════════════════════════════════════════════════════════════════════
 * Admin Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { authenticate, requirePermissions } = require('../middleware/auth');
const storageService = require('../services/storageService');
const deduplicationService = require('../services/deduplicationService');
const logger = require('../utils/logger');

// All admin routes require authentication and admin permissions
router.use(authenticate);
router.use(requirePermissions({ admin: true }));

/**
 * GET /api/admin/stats - Storage statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await storageService.getStorageStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Failed to get storage stats', { error: error.message });
    res.status(500).json({
      error: 'STATS_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/deduplication - Deduplication statistics
 */
router.get('/deduplication', async (req, res) => {
  try {
    const stats = await deduplicationService.getDeduplicationStats();

    res.json({
      success: true,
      deduplication: stats
    });
  } catch (error) {
    logger.error('Failed to get deduplication stats', { error: error.message });
    res.status(500).json({
      error: 'DEDUP_STATS_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/duplicates - Find duplicate files across users
 */
router.get('/duplicates', async (req, res) => {
  try {
    const duplicates = await deduplicationService.findDuplicateFilesAcrossUsers();

    res.json({
      success: true,
      duplicates,
      count: duplicates.length
    });
  } catch (error) {
    logger.error('Failed to find duplicates', { error: error.message });
    res.status(500).json({
      error: 'FIND_DUPLICATES_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/cleanup - Cleanup orphaned files
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { minAge } = req.body;

    const options = {
      minAge: minAge || 86400000 // 24 hours default
    };

    const result = await storageService.cleanupOrphanedFiles(options);

    res.json({
      success: true,
      cleanup: result
    });
  } catch (error) {
    logger.error('Cleanup failed', { error: error.message });
    res.status(500).json({
      error: 'CLEANUP_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/cleanup/blobs - Cleanup unreferenced blobs
 */
router.post('/cleanup/blobs', async (req, res) => {
  try {
    const { minAge } = req.body;

    const options = {
      minAge: minAge || 86400000 // 24 hours default
    };

    const result = await deduplicationService.cleanupUnreferencedBlobs(options);

    res.json({
      success: true,
      cleanup: result
    });
  } catch (error) {
    logger.error('Blob cleanup failed', { error: error.message });
    res.status(500).json({
      error: 'BLOB_CLEANUP_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/quotas - Get all user quotas
 */
router.get('/quotas', async (req, res) => {
  try {
    const { StorageQuota } = require('../models');

    const quotas = await StorageQuota.findAll({
      order: [['used_bytes', 'DESC']],
      limit: parseInt(req.query.limit) || 100
    });

    res.json({
      success: true,
      quotas: quotas.map(q => q.toJSON())
    });
  } catch (error) {
    logger.error('Failed to get quotas', { error: error.message });
    res.status(500).json({
      error: 'QUOTAS_FAILED',
      message: error.message
    });
  }
});

/**
 * PUT /api/admin/quotas/:userId - Update user quota
 */
router.put('/quotas/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { quotaBytes } = req.body;

    if (!quotaBytes || quotaBytes < 0) {
      return res.status(400).json({
        error: 'INVALID_QUOTA',
        message: 'Valid quota in bytes is required'
      });
    }

    const quota = await storageService.updateUserQuota(userId, quotaBytes);

    res.json({
      success: true,
      quota
    });
  } catch (error) {
    logger.error('Failed to update quota', { error: error.message });
    res.status(500).json({
      error: 'QUOTA_UPDATE_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/migrate - Migrate files between backends
 */
router.post('/migrate', async (req, res) => {
  try {
    const { fileIds, toBackend, deleteSource } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'fileIds array is required'
      });
    }

    if (!toBackend) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'toBackend is required'
      });
    }

    const result = await storageService.migrateFiles(fileIds, toBackend, {
      deleteSource: deleteSource !== false
    });

    res.json({
      success: true,
      migration: result
    });
  } catch (error) {
    logger.error('Migration failed', { error: error.message });
    res.status(500).json({
      error: 'MIGRATION_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/verify/:blobId - Verify blob integrity
 */
router.post('/verify/:blobId', async (req, res) => {
  try {
    const { blobId } = req.params;

    const result = await deduplicationService.verifyBlobIntegrity(blobId);

    res.json({
      success: true,
      verification: result
    });
  } catch (error) {
    logger.error('Verification failed', { error: error.message });
    res.status(500).json({
      error: 'VERIFICATION_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/storage/health - Storage health status
 */
router.get('/storage/health', async (req, res) => {
  try {
    const health = await storageService.getHealthStatus();

    res.json({
      success: true,
      health
    });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(500).json({
      error: 'HEALTH_CHECK_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
