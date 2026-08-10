/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - Prefetch Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('@exprsn/shared');
const {
  prefetchTimeline,
  getCachedTimeline,
  invalidateTimeline,
  getCacheStatus
} = require('../services/prefetchService');
const { requireToken, requireWrite, requireDelete } = require('../middleware/auth');
const { validateUUID, validatePriority } = require('../middleware/validation');
const { queuePrefetch, getQueueStats, getFailedJobs, retryFailedJob } = require('../queues/prefetchQueue');
const metricsService = require('../services/metricsService');

/**
 * POST /api/prefetch/schedule/:userId - Schedule prefetch using queue
 * Requires write permission
 */
router.post('/schedule/:userId',
  validateUUID('userId'),
  validatePriority,
  requireWrite('/prefetch'),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { priority = 'medium', delay = 0 } = req.body;

    const job = await queuePrefetch(userId, priority, { delay });

    res.status(202).json({
      success: true,
      message: 'Prefetch job scheduled',
      data: {
        jobId: job.id,
        userId,
        priority,
        delay
      }
    });
  })
);

/**
 * POST /api/prefetch/immediate/:userId - Immediate prefetch (bypass queue)
 * Requires write permission
 */
router.post('/immediate/:userId',
  validateUUID('userId'),
  validatePriority,
  requireWrite('/prefetch'),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { priority = 'medium' } = req.body;

    const result = await prefetchTimeline(userId, priority);

    if (!result.success) {
      throw new AppError(result.error, 500, 'PREFETCH_FAILED');
    }

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * GET /api/cache/:userId - Get cached timeline
 * Requires read permission
 */
router.get('/:userId',
  validateUUID('userId'),
  requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/prefetch' }),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const timeline = await getCachedTimeline(userId);

    if (!timeline) {
      throw new AppError('Timeline not cached', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: timeline,
      meta: {
        cached: true,
        tier: timeline.tier,
        fetchedAt: timeline.fetchedAt
      }
    });
  })
);

/**
 * DELETE /api/cache/:userId/timeline - Invalidate cached timeline
 * Requires delete permission
 */
router.delete('/:userId/timeline',
  validateUUID('userId'),
  requireDelete('/prefetch'),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const result = await invalidateTimeline(userId);

    if (!result.success) {
      throw new AppError(result.error, 500, 'INVALIDATION_FAILED');
    }

    res.json({
      success: true,
      message: 'Cache invalidated',
      data: { userId }
    });
  })
);

/**
 * GET /api/cache/status/:userId - Check cache status
 * Requires read permission
 */
router.get('/status/:userId',
  validateUUID('userId'),
  requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/prefetch' }),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const status = await getCacheStatus(userId);

    res.json({
      success: true,
      data: status
    });
  })
);

/**
 * GET /api/prefetch/queue/stats - Get queue statistics
 * Requires read permission
 */
router.get('/queue/stats',
  requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/prefetch' }),
  asyncHandler(async (req, res) => {
    const stats = await getQueueStats();

    res.json({
      success: true,
      data: stats
    });
  })
);

/**
 * GET /api/prefetch/queue/failed - Get failed jobs
 * Requires read permission
 */
router.get('/queue/failed',
  requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/prefetch' }),
  asyncHandler(async (req, res) => {
    const { limit = 10 } = req.query;
    const failed = await getFailedJobs(parseInt(limit, 10));

    res.json({
      success: true,
      data: {
        jobs: failed,
        count: failed.length
      }
    });
  })
);

/**
 * POST /api/prefetch/queue/retry/:jobId - Retry failed job
 * Requires write permission
 */
router.post('/queue/retry/:jobId',
  requireWrite('/prefetch'),
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const result = await retryFailedJob(jobId);

    res.json({
      success: true,
      message: 'Job retry initiated',
      data: result
    });
  })
);

/**
 * GET /api/prefetch/metrics - Get cache and prefetch metrics
 * Requires read permission
 */
router.get('/metrics',
  requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/prefetch' }),
  asyncHandler(async (req, res) => {
    const [cacheMetrics, prefetchMetrics] = await Promise.all([
      metricsService.getMetrics(),
      metricsService.getPrefetchMetrics()
    ]);

    res.json({
      success: true,
      data: {
        cache: cacheMetrics,
        prefetch: prefetchMetrics,
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * GET /api/prefetch/metrics/:date - Get metrics for specific date
 * Requires read permission
 */
router.get('/metrics/:date',
  requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/prefetch' }),
  asyncHandler(async (req, res) => {
    const { date } = req.params;

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError('Invalid date format. Use YYYY-MM-DD', 400, 'INVALID_DATE');
    }

    const metrics = await metricsService.getMetricsByDate(date);

    res.json({
      success: true,
      data: metrics
    });
  })
);

module.exports = router;
