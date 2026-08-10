/**
 * ═══════════════════════════════════════════════════════════
 * Queue Integration Tests
 * ═══════════════════════════════════════════════════════════
 */

const queueService = require('../../services/queueService');
const { ReviewQueue } = require('../../models/sequelize-index');
const { createTestModerationCase, createTestQueueItem } = require('./setup');

describe('Queue Service Integration', () => {
  describe('addToQueue', () => {
    it('should add item to review queue', async () => {
      const moderationCase = await createTestModerationCase();

      const queueItem = await queueService.addToQueue(moderationCase.id);

      expect(queueItem).toBeDefined();
      expect(queueItem.moderationItemId).toBe(moderationCase.id);
      expect(queueItem.status).toBe('pending');
      expect(queueItem.priority).toBeGreaterThan(0);
    });

    it('should calculate priority based on risk score', async () => {
      const moderationCase = await createTestModerationCase();
      await moderationCase.update({ riskScore: 85 });

      const queueItem = await queueService.addToQueue(moderationCase.id);

      expect(queueItem.priority).toBeGreaterThan(50);
    });

    it('should mark high-risk items as escalated', async () => {
      const moderationCase = await createTestModerationCase();
      await moderationCase.update({ riskScore: 95 });

      const queueItem = await queueService.addToQueue(moderationCase.id);

      expect(queueItem.escalated).toBe(true);
      expect(queueItem.escalatedReason).toBeDefined();
    });
  });

  describe('getNextItem', () => {
    it('should retrieve highest priority unassigned item', async () => {
      const case1 = await createTestModerationCase();
      const case2 = await createTestModerationCase();

      await queueService.addToQueue(case1.id, { priority: 50 });
      await queueService.addToQueue(case2.id, { priority: 80 });

      const nextItem = await queueService.getNextItem('reviewer-123');

      expect(nextItem).toBeDefined();
      expect(nextItem.moderationItemId).toBe(case2.id);
      expect(nextItem.priority).toBe(80);
    });

    it('should return null when queue is empty', async () => {
      const nextItem = await queueService.getNextItem('reviewer-123');

      expect(nextItem).toBeNull();
    });

    it('should filter by escalated status', async () => {
      const case1 = await createTestModerationCase();
      const case2 = await createTestModerationCase();

      await queueService.addToQueue(case1.id, { escalated: false });
      await queueService.addToQueue(case2.id, { escalated: true });

      const nextItem = await queueService.getNextItem('reviewer-123', {
        escalated: true
      });

      expect(nextItem).toBeDefined();
      expect(nextItem.moderationItemId).toBe(case2.id);
    });
  });

  describe('assignReviewer', () => {
    it('should assign reviewer to queue item', async () => {
      const moderationCase = await createTestModerationCase();
      const queueItem = await queueService.addToQueue(moderationCase.id);

      const updated = await queueService.assignReviewer(
        queueItem.id,
        'reviewer-123'
      );

      expect(updated.assignedTo).toBe('reviewer-123');
      expect(updated.status).toBe('reviewing');
      expect(updated.claimedAt).toBeDefined();
    });

    it('should reject assignment if already assigned', async () => {
      const moderationCase = await createTestModerationCase();
      const queueItem = await queueService.addToQueue(moderationCase.id);

      await queueService.assignReviewer(queueItem.id, 'reviewer-123');

      await expect(
        queueService.assignReviewer(queueItem.id, 'reviewer-456')
      ).rejects.toThrow('already assigned');
    });
  });

  describe('updateQueueStatus', () => {
    it('should update queue item status to completed', async () => {
      const moderationCase = await createTestModerationCase();
      const queueItem = await queueService.addToQueue(moderationCase.id);
      await queueService.assignReviewer(queueItem.id, 'reviewer-123');

      const updated = await queueService.updateQueueStatus(
        queueItem.id,
        'approved'
      );

      expect(updated.status).toBe('approved');
      expect(updated.completedAt).toBeDefined();
    });
  });

  describe('getQueue', () => {
    it('should retrieve queue items with filters', async () => {
      const case1 = await createTestModerationCase();
      const case2 = await createTestModerationCase();
      const case3 = await createTestModerationCase();

      await queueService.addToQueue(case1.id);
      await queueService.addToQueue(case2.id);
      const item3 = await queueService.addToQueue(case3.id);
      await queueService.assignReviewer(item3.id, 'reviewer-123');

      const pendingItems = await queueService.getQueue({ status: 'pending' });

      expect(pendingItems).toHaveLength(2);
    });

    it('should filter by assigned reviewer', async () => {
      const case1 = await createTestModerationCase();
      const case2 = await createTestModerationCase();

      const item1 = await queueService.addToQueue(case1.id);
      const item2 = await queueService.addToQueue(case2.id);

      await queueService.assignReviewer(item1.id, 'reviewer-123');
      await queueService.assignReviewer(item2.id, 'reviewer-456');

      const items = await queueService.getQueue({
        assignedTo: 'reviewer-123'
      });

      expect(items).toHaveLength(1);
      expect(items[0].assignedTo).toBe('reviewer-123');
    });

    it('should limit results', async () => {
      for (let i = 0; i < 5; i++) {
        const moderationCase = await createTestModerationCase();
        await queueService.addToQueue(moderationCase.id);
      }

      const items = await queueService.getQueue({ limit: 3 });

      expect(items).toHaveLength(3);
    });
  });

  describe('getQueueStats', () => {
    it('should calculate queue statistics', async () => {
      const case1 = await createTestModerationCase();
      const case2 = await createTestModerationCase();
      const case3 = await createTestModerationCase();

      await queueService.addToQueue(case1.id);
      const item2 = await queueService.addToQueue(case2.id);
      await queueService.addToQueue(case3.id, { escalated: true });

      await queueService.assignReviewer(item2.id, 'reviewer-123');

      const stats = await queueService.getQueueStats();

      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(2);
      expect(stats.reviewing).toBe(1);
      expect(stats.escalated).toBe(1);
    });

    it('should calculate average wait time', async () => {
      const stats = await queueService.getQueueStats();

      expect(stats).toHaveProperty('avgWaitTimeMinutes');
      expect(typeof stats.avgWaitTimeMinutes).toBe('number');
    });
  });
});
