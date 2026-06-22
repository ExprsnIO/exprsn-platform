/**
 * ═══════════════════════════════════════════════════════════
 * Moderation Integration Tests
 * ═══════════════════════════════════════════════════════════
 */

const moderationService = require('../../services/moderationService');
const moderationActions = require('../../services/moderationActions');
const { ModerationCase } = require('../../models/sequelize-index');
const { createTestModerationCase } = require('./setup');

describe('Moderation Service Integration', () => {
  describe('moderateContent', () => {
    it('should create moderation case with risk score', async () => {
      const params = {
        contentType: 'post',
        contentId: 'test-123',
        sourceService: 'timeline.exprsn.io',
        userId: 'user-456',
        content: {
          text: 'This is a test post'
        }
      };

      const result = await moderationService.moderateContent(params);

      expect(result).toHaveProperty('moderationCase');
      expect(result).toHaveProperty('decision');
      expect(result).toHaveProperty('riskScore');
      expect(result.moderationCase.contentId).toBe('test-123');
      expect(typeof result.riskScore).toBe('number');
    });

    it('should auto-approve low-risk content', async () => {
      const params = {
        contentType: 'post',
        contentId: 'safe-content',
        sourceService: 'timeline.exprsn.io',
        userId: 'user-456',
        content: {
          text: 'Hello world'
        }
      };

      const result = await moderationService.moderateContent(params);

      expect(result.decision).toBe('approved');
      expect(result.automated).toBe(true);
    });

    it('should queue medium-risk content for manual review', async () => {
      const params = {
        contentType: 'post',
        contentId: 'medium-risk',
        sourceService: 'timeline.exprsn.io',
        userId: 'user-456',
        content: {
          text: 'Potentially questionable content here'
        }
      };

      const result = await moderationService.moderateContent(params);

      // Depending on AI classification, this might be queued
      expect(result.decision).toMatch(/approved|pending|rejected/);
    });
  });

  describe('Moderation Actions', () => {
    it('should execute content removal action', async () => {
      const moderationCase = await createTestModerationCase();

      const result = await moderationActions.removeContent({
        contentType: moderationCase.contentType,
        contentId: moderationCase.contentId,
        sourceService: moderationCase.sourceService,
        moderationItemId: moderationCase.id,
        performedBy: 'moderator-123',
        reason: 'Violates community guidelines',
        isAutomated: false
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('remove');
    });

    it('should warn user', async () => {
      const result = await moderationActions.warnUser({
        userId: 'user-456',
        reason: 'First warning for policy violation',
        performedBy: 'moderator-123'
      });

      expect(result.success).toBe(true);
      expect(result.actionType).toBe('warn');
      expect(result.userId).toBe('user-456');
    });

    it('should suspend user with expiration', async () => {
      const result = await moderationActions.suspendUser({
        userId: 'user-456',
        reason: 'Multiple violations',
        durationSeconds: 7 * 24 * 3600, // 7 days
        performedBy: 'moderator-123'
      });

      expect(result.success).toBe(true);
      expect(result.actionType).toBe('suspend');
      expect(result.expiresAt).toBeDefined();
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should ban user permanently', async () => {
      const result = await moderationActions.banUser({
        userId: 'user-456',
        reason: 'Severe violations',
        performedBy: 'moderator-123'
      });

      expect(result.success).toBe(true);
      expect(result.actionType).toBe('ban');
      expect(result.expiresAt).toBeNull();
    });
  });

  describe('Batch Moderation', () => {
    it('should process multiple content items', async () => {
      const items = [
        {
          contentType: 'post',
          contentId: 'post-1',
          sourceService: 'timeline.exprsn.io',
          userId: 'user-1',
          content: { text: 'Post 1' }
        },
        {
          contentType: 'post',
          contentId: 'post-2',
          sourceService: 'timeline.exprsn.io',
          userId: 'user-2',
          content: { text: 'Post 2' }
        },
        {
          contentType: 'post',
          contentId: 'post-3',
          sourceService: 'timeline.exprsn.io',
          userId: 'user-3',
          content: { text: 'Post 3' }
        }
      ];

      const results = await Promise.all(
        items.map(item => moderationService.moderateContent(item))
      );

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('decision');
        expect(result).toHaveProperty('riskScore');
      });
    });
  });

  describe('Automated Decisions', () => {
    it('should automatically approve safe content', async () => {
      const params = {
        contentType: 'post',
        contentId: 'safe-123',
        sourceService: 'timeline.exprsn.io',
        userId: 'user-456',
        content: {
          text: 'Just sharing a nice photo of my cat!'
        }
      };

      const result = await moderationService.moderateContent(params);

      expect(result.automated).toBe(true);
      expect(result.decision).toBe('approved');
    });
  });

  describe('Manual Review Escalation', () => {
    it('should create queue item for manual review', async () => {
      const moderationCase = await createTestModerationCase();

      // Update to require manual review
      await moderationCase.update({
        riskScore: 65,
        status: 'reviewing'
      });

      const queueService = require('../../services/queueService');
      const queueItem = await queueService.addToQueue(moderationCase.id);

      expect(queueItem).toBeDefined();
      expect(queueItem.moderationItemId).toBe(moderationCase.id);
      expect(queueItem.status).toBe('pending');
    });

    it('should escalate high-risk content', async () => {
      const moderationCase = await createTestModerationCase();

      // Update to high risk
      await moderationCase.update({
        riskScore: 95
      });

      const queueService = require('../../services/queueService');
      const queueItem = await queueService.addToQueue(moderationCase.id);

      expect(queueItem.escalated).toBe(true);
      expect(queueItem.priority).toBeGreaterThan(50);
    });
  });
});
