/**
 * Queue Monitoring Routes
 * Monitor and manage Bull queues
 */

const express = require('express');
const { createLogger } = require('@exprsn/shared');
const { requireAuth } = require('../middleware/auth');
const {
  getAllQueueStats,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  cleanQueue
} = require('../services/queueService');

const router = express.Router();
const logger = createLogger('exprsn-spark:queues');

/**
 * GET /api/queues/stats
 * Get statistics for all queues
 */
router.get('/stats',
  requireAuth,
  async (req, res) => {
    try {
      // Only allow admin users
      if (!req.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const stats = await getAllQueueStats();

      res.json({
        queues: stats,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to get queue stats', {
        error: error.message
      });
      res.status(500).json({ error: 'Failed to get queue statistics' });
    }
  }
);

/**
 * GET /api/queues/:name/stats
 * Get statistics for specific queue
 */
router.get('/:name/stats',
  requireAuth,
  async (req, res) => {
    try {
      const { name } = req.params;

      // Only allow admin users
      if (!req.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const stats = await getQueueStats(name);

      res.json({
        queue: stats,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to get queue stats', {
        queueName: req.params.name,
        error: error.message
      });

      if (error.message.includes('Unknown queue')) {
        return res.status(404).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to get queue statistics' });
    }
  }
);

/**
 * POST /api/queues/:name/pause
 * Pause queue processing
 */
router.post('/:name/pause',
  requireAuth,
  async (req, res) => {
    try {
      const { name } = req.params;

      // Only allow admin users
      if (!req.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      await pauseQueue(name);

      logger.info('Queue paused', {
        queueName: name,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: `Queue ${name} paused`
      });
    } catch (error) {
      logger.error('Failed to pause queue', {
        queueName: req.params.name,
        error: error.message
      });

      if (error.message.includes('Unknown queue')) {
        return res.status(404).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to pause queue' });
    }
  }
);

/**
 * POST /api/queues/:name/resume
 * Resume queue processing
 */
router.post('/:name/resume',
  requireAuth,
  async (req, res) => {
    try {
      const { name } = req.params;

      // Only allow admin users
      if (!req.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      await resumeQueue(name);

      logger.info('Queue resumed', {
        queueName: name,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: `Queue ${name} resumed`
      });
    } catch (error) {
      logger.error('Failed to resume queue', {
        queueName: req.params.name,
        error: error.message
      });

      if (error.message.includes('Unknown queue')) {
        return res.status(404).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to resume queue' });
    }
  }
);

/**
 * POST /api/queues/:name/clean
 * Clean completed jobs from queue
 */
router.post('/:name/clean',
  requireAuth,
  async (req, res) => {
    try {
      const { name } = req.params;
      const { grace = 3600000 } = req.body; // Default 1 hour

      // Only allow admin users
      if (!req.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      await cleanQueue(name, grace);

      logger.info('Queue cleaned', {
        queueName: name,
        grace,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: `Queue ${name} cleaned`,
        grace
      });
    } catch (error) {
      logger.error('Failed to clean queue', {
        queueName: req.params.name,
        error: error.message
      });

      if (error.message.includes('Unknown queue')) {
        return res.status(404).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to clean queue' });
    }
  }
);

module.exports = router;
