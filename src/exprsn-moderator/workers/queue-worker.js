/**
 * ═══════════════════════════════════════════════════════════
 * Queue Worker
 * Background worker for processing moderation queue
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const logger = require('../src/utils/logger');
const { ReviewQueue, ModerationItem } = require('../models');

class QueueWorker {
  constructor() {
    this.isRunning = false;
    this.pollInterval = 5000; // 5 seconds
  }

  /**
   * Start the worker
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Worker already running');
      return;
    }

    this.isRunning = true;
    logger.info('Queue worker started');

    // Start polling
    this.poll();
  }

  /**
   * Stop the worker
   */
  stop() {
    this.isRunning = false;
    logger.info('Queue worker stopped');
  }

  /**
   * Poll for queue items
   */
  async poll() {
    while (this.isRunning) {
      try {
        await this.processQueue();
      } catch (error) {
        logger.error('Queue processing error', { error: error.message });
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
    }
  }

  /**
   * Process queue items
   */
  async processQueue() {
    // Get pending items
    const items = await ReviewQueue.findAll({
      where: { status: 'pending' },
      order: [
        ['priority', 'DESC'],
        ['queued_at', 'ASC']
      ],
      limit: 10
    });

    if (items.length === 0) {
      return;
    }

    logger.info(`Processing ${items.length} queue items`);

    for (const item of items) {
      await this.processItem(item);
    }
  }

  /**
   * Process a single queue item
   */
  async processItem(queueItem) {
    try {
      // Load moderation item
      const moderationItem = await ModerationItem.findByPk(queueItem.moderation_item_id);

      if (!moderationItem) {
        logger.warn('Moderation item not found', { queueItemId: queueItem.id });
        await ReviewQueue.delete(queueItem.id);
        return;
      }

      // Check if already assigned
      if (queueItem.assigned_to) {
        // Check if assignment expired (e.g., after 30 minutes)
        const assignedAt = queueItem.assigned_at;
        const now = Date.now();
        const expirationTime = 30 * 60 * 1000; // 30 minutes

        if (now - assignedAt < expirationTime) {
          // Still assigned, skip
          return;
        }

        // Assignment expired, unassign
        logger.info('Queue item assignment expired, unassigning', {
          queueItemId: queueItem.id,
          assignedTo: queueItem.assigned_to
        });

        await ReviewQueue.update(queueItem.id, {
          assigned_to: null,
          assigned_at: null
        });
      }

      // Perform automated checks
      // This is a placeholder for more complex automated processing
      logger.debug('Processing queue item', {
        queueItemId: queueItem.id,
        moderationItemId: moderationItem.id,
        riskScore: moderationItem.riskScore
      });

      // Could implement:
      // - Secondary AI analysis
      // - Pattern matching
      // - Historical user behavior check
      // - Automated rule application

    } catch (error) {
      logger.error('Error processing queue item', {
        queueItemId: queueItem.id,
        error: error.message
      });
    }
  }
}

// Start worker if run directly
if (require.main === module) {
  const worker = new QueueWorker();

  worker.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, stopping worker');
    worker.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, stopping worker');
    worker.stop();
    process.exit(0);
  });
}

module.exports = QueueWorker;
