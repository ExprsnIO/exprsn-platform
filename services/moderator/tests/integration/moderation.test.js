/**
 * ═══════════════════════════════════════════════════════════
 * Moderation Integration Tests
 *
 * Exercises moderationService + moderationActions against the canonical
 * Sequelize model layer. External I/O is mocked: the AI provider factory
 * (no API keys are configured in test/dev), Herald notifications, and the
 * outbound axios calls to source services.
 *
 * Assertions follow the service's real return contract
 * (`_formatModerationResult`: moderationId/status/riskScore/...), not the
 * speculative `moderationCase`/`decision`/`automated` shape the previous
 * version asserted (which the service has never produced).
 * ═══════════════════════════════════════════════════════════
 */

// Mock outbound I/O before requiring the services.
jest.mock('../../src/ai-providers', () => ({
  analyzeContent: jest.fn().mockResolvedValue({
    riskScore: 5,
    toxicityScore: 5,
    nsfwScore: 0,
    spamScore: 0,
    violenceScore: 0,
    hateSpeechScore: 0,
    provider: 'local',
    model: 'mock-1',
    explanation: 'looks fine',
    rawResponse: {}
  }),
  // FEAT-023: moderateContent fans out shadow evaluations after the enforced
  // verdict; none are configured in these tests.
  getShadowProviders: jest.fn().mockReturnValue([])
}));

jest.mock('../../services/heraldClient', () => ({
  notifyUser: jest.fn().mockResolvedValue({ success: true }),
  notifyModerators: jest.fn().mockResolvedValue({ success: true }),
  notifyService: jest.fn().mockResolvedValue({ success: true }),
  notifyContentDecision: jest.fn().mockResolvedValue({ success: true }),
  notifyUserAction: jest.fn().mockResolvedValue({ success: true }),
  notifyHighPriorityContent: jest.fn().mockResolvedValue({ success: true }),
  notifyEscalation: jest.fn().mockResolvedValue({ success: true })
}));

jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ data: {} }),
  get: jest.fn().mockResolvedValue({ data: {} })
}));

const aiProviderFactory = require('../../src/ai-providers');
const moderationService = require('../../services/moderationService');
const moderationActions = require('../../services/moderationActions');
const { createTestModerationCase } = require('./setup');

const USER = 'aaaaaaaa-0000-4000-8000-000000000456';
const MODERATOR = 'cccccccc-0000-4000-8000-000000000123';

describe('Moderation Service Integration', () => {
  describe('moderateContent', () => {
    it('should create a moderation record with a numeric risk score', async () => {
      const result = await moderationService.moderateContent({
        contentType: 'post',
        contentId: 'mc-test-123',
        sourceService: 'timeline.exprsn.io',
        userId: USER,
        content: { text: 'This is a test post' }
      });

      expect(result).toHaveProperty('moderationId');
      expect(result).toHaveProperty('status');
      expect(typeof result.riskScore).toBe('number');
    });

    it('should auto-approve low-risk content', async () => {
      const result = await moderationService.moderateContent({
        contentType: 'post',
        contentId: 'mc-safe-1',
        sourceService: 'timeline.exprsn.io',
        userId: USER,
        content: { text: 'Hello world' }
      });

      expect(result.status).toBe('approved');
      expect(result.approved).toBe(true);
      expect(result.requiresReview).toBe(false);
    });

    it('should queue high-risk content for manual review', async () => {
      aiProviderFactory.analyzeContent.mockResolvedValueOnce({
        riskScore: 95,
        toxicityScore: 95,
        nsfwScore: 0,
        spamScore: 0,
        violenceScore: 0,
        hateSpeechScore: 0,
        provider: 'local',
        model: 'mock-1',
        explanation: 'high toxicity',
        rawResponse: {}
      });

      const result = await moderationService.moderateContent({
        contentType: 'post',
        contentId: 'mc-risky-1',
        sourceService: 'timeline.exprsn.io',
        userId: USER,
        content: { text: 'questionable content' }
      });

      expect(result).toHaveProperty('moderationId');
      expect(result.riskScore).toBe(95);
      expect(result.requiresReview).toBe(true);
    });

    it('should return the existing record for already-moderated content', async () => {
      const params = {
        contentType: 'post',
        contentId: 'mc-dup-1',
        sourceService: 'timeline.exprsn.io',
        userId: USER,
        content: { text: 'dedupe me' }
      };

      const first = await moderationService.moderateContent(params);
      const second = await moderationService.moderateContent(params);

      expect(second.moderationId).toBe(first.moderationId);
    });
  });

  describe('Moderation Actions', () => {
    it('should execute a content removal action', async () => {
      const moderationCase = await createTestModerationCase();

      const result = await moderationActions.removeContent({
        contentType: moderationCase.contentType,
        contentId: moderationCase.contentId,
        sourceService: moderationCase.sourceService,
        moderationItemId: moderationCase.id,
        performedBy: MODERATOR,
        reason: 'Violates community guidelines',
        isAutomated: false
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('remove');
      expect(result.actionId).toBeDefined();
    });

    it('should warn a user', async () => {
      const result = await moderationActions.warnUser({
        userId: USER,
        reason: 'First warning for policy violation',
        performedBy: MODERATOR
      });

      expect(result.success).toBe(true);
      expect(result.actionType).toBe('warn');
      expect(result.userId).toBe(USER);
    });

    it('should suspend a user with an expiration', async () => {
      const result = await moderationActions.suspendUser({
        userId: USER,
        reason: 'Multiple violations',
        durationSeconds: 7 * 24 * 3600,
        performedBy: MODERATOR
      });

      expect(result.success).toBe(true);
      expect(result.actionType).toBe('suspend');
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should ban a user permanently', async () => {
      const result = await moderationActions.banUser({
        userId: USER,
        reason: 'Severe violations',
        performedBy: MODERATOR
      });

      expect(result.success).toBe(true);
      expect(result.actionType).toBe('ban');
      expect(result.expiresAt).toBeNull();
    });
  });

  describe('Batch Moderation', () => {
    it('should process multiple content items', async () => {
      const items = [1, 2, 3].map((n) => ({
        contentType: 'post',
        contentId: `batch-post-${n}`,
        sourceService: 'timeline.exprsn.io',
        userId: USER,
        content: { text: `Post ${n}` }
      }));

      const results = await Promise.all(
        items.map((item) => moderationService.moderateContent(item))
      );

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toHaveProperty('moderationId');
        expect(typeof result.riskScore).toBe('number');
      });
    });
  });

  describe('Manual Review Escalation', () => {
    it('should create a queue item for manual review', async () => {
      const moderationCase = await createTestModerationCase();
      await moderationCase.update({ riskScore: 65, status: 'reviewing' });

      const queueService = require('../../services/queueService');
      const queueItem = await queueService.addToQueue(moderationCase.id);

      expect(queueItem).toBeDefined();
      expect(queueItem.moderationItemId).toBe(moderationCase.id);
      expect(queueItem.status).toBe('pending');
    });

    it('should escalate high-risk content', async () => {
      const moderationCase = await createTestModerationCase();
      await moderationCase.update({ riskScore: 95 });

      const queueService = require('../../services/queueService');
      const queueItem = await queueService.addToQueue(moderationCase.id);

      expect(queueItem.escalated).toBe(true);
      expect(queueItem.priority).toBeGreaterThan(50);
    });
  });
});
