/**
 * ═══════════════════════════════════════════════════════════════════════
 * Storage Management Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const fileService = require('../services/fileService');
const {
  authenticate,
  asyncHandler
} = require('../middleware');

/**
 * Get storage usage
 * GET /api/storage/usage
 */
router.get('/usage',
  authenticate,
  asyncHandler(async (req, res) => {
    const usage = await fileService.getStorageUsage(req.userId);

    res.json({
      success: true,
      usage: {
        fileCount: usage.fileCount,
        totalSize: usage.totalSize,
        totalSizeMB: (usage.totalSize / (1024 * 1024)).toFixed(2),
        totalSizeGB: (usage.totalSize / (1024 * 1024 * 1024)).toFixed(2)
      }
    });
  })
);

/**
 * Get quota information
 * GET /api/storage/quota
 */
router.get('/quota',
  authenticate,
  asyncHandler(async (req, res) => {
    const usage = await fileService.getStorageUsage(req.userId);

    // Mock quota - in production, this would come from user settings
    const quota = 10 * 1024 * 1024 * 1024; // 10GB

    res.json({
      success: true,
      quota: {
        used: usage.totalSize,
        total: quota,
        available: quota - usage.totalSize,
        usedPercentage: ((usage.totalSize / quota) * 100).toFixed(2)
      }
    });
  })
);

module.exports = router;
