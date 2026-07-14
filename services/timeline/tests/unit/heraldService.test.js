/**
 * ═══════════════════════════════════════════════════════════
 * Herald Service Tests
 * Test notification service integration
 * ═══════════════════════════════════════════════════════════
 */

// The heraldService captures its axios client ONCE at module-require time via
// axios.create(...). Reassigning axios.create per-test has no effect on the
// already-captured client, so we expose a single persistent mock client and
// drive its .post/.get methods per-test instead.
const mockHeraldClient = {
  post: jest.fn(),
  get: jest.fn(),
  interceptors: {
    request: { use: jest.fn() }
  }
};

jest.mock('axios', () => ({
  create: jest.fn(() => mockHeraldClient)
}));

// FEAT-011 N1a: notifyInteraction now consults the block/mute façade. Mock it so
// these tests exercise the Herald path (default: nothing suppressed). Suppression
// behavior itself is covered in notificationSuppression.test.js.
jest.mock('../../src/services/relationshipService', () => ({
  getSuppressedIds: jest.fn().mockResolvedValue([])
}));

const heraldService = require('../../src/services/heraldService');
const relationshipService = require('../../src/services/relationshipService');
const config = require('../../src/config');

describe('Herald Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // setup.js sets HERALD_ENABLED=false, but config.herald.enabled is computed
    // at require-time. Force it on for the tests that exercise the HTTP path.
    config.herald.enabled = true;
    // Default: no block/mute suppression (resetMocks wipes the factory default).
    relationshipService.getSuppressedIds.mockResolvedValue([]);
  });

  describe('sendNotification', () => {
    it('should send notification via Herald API', async () => {
      const userId = 'user-123';
      const notification = {
        type: 'like',
        title: 'New Like',
        body: 'Someone liked your post',
        data: { postId: 'post-456' }
      };

      mockHeraldClient.post.mockResolvedValue({
        data: {
          success: true,
          notification: {
            id: 'notif-789',
            channel: 'in-app',
            status: 'sent'
          }
        }
      });

      const result = await heraldService.sendNotification(userId, notification);

      expect(result.success).toBe(true);
      expect(result.notificationId).toBe('notif-789');
    });

    it('should handle Herald API errors gracefully', async () => {
      const userId = 'user-123';
      const notification = {
        type: 'like',
        title: 'New Like',
        body: 'Someone liked your post'
      };

      mockHeraldClient.post.mockRejectedValue(new Error('Service unavailable'));

      const result = await heraldService.sendNotification(userId, notification);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should skip notification if Herald is disabled', async () => {
      config.herald.enabled = false;

      const result = await heraldService.sendNotification('user-123', {
        type: 'like',
        title: 'Test',
        body: 'Test'
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Herald service disabled');
    });
  });

  describe('notifyInteraction', () => {
    it('should send like notification', async () => {
      mockHeraldClient.post.mockResolvedValue({
        data: { success: true, notification: { id: 'notif-123' } }
      });

      const result = await heraldService.notifyInteraction(
        'like',
        'recipient-123',
        'actor-456',
        { id: 'post-789' }
      );

      expect(result.success).toBe(true);
    });

    it('should not notify for self-interactions', async () => {
      const userId = 'user-123';

      const result = await heraldService.notifyInteraction(
        'like',
        userId, // recipient
        userId, // actor (same user)
        { id: 'post-789' }
      );

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Self-interaction');
    });

    it('should handle different notification types', async () => {
      mockHeraldClient.post.mockResolvedValue({
        data: { success: true, notification: { id: 'notif-123' } }
      });

      const types = ['like', 'repost', 'comment', 'reply', 'mention', 'follow'];

      for (const type of types) {
        const result = await heraldService.notifyInteraction(
          type,
          'recipient-123',
          'actor-456',
          { id: 'post-789' }
        );

        expect(result.success).toBe(true);
      }
    });

    it('should include comment text in notification', async () => {
      let capturedPayload;

      mockHeraldClient.post.mockImplementation((url, data) => {
        capturedPayload = data;
        return Promise.resolve({
          data: { success: true, notification: { id: 'notif-123' } }
        });
      });

      await heraldService.notifyInteraction(
        'comment',
        'recipient-123',
        'actor-456',
        { id: 'post-789' },
        { commentText: 'Great post!' }
      );

      expect(capturedPayload.body).toContain('Great post!');
    });

    it('should mark mentions as high priority', async () => {
      let capturedPayload;

      mockHeraldClient.post.mockImplementation((url, data) => {
        capturedPayload = data;
        return Promise.resolve({
          data: { success: true, notification: { id: 'notif-123' } }
        });
      });

      await heraldService.notifyInteraction(
        'mention',
        'recipient-123',
        'actor-456',
        { id: 'post-789' }
      );

      expect(capturedPayload.priority).toBe('high');
    });
  });

  describe('sendBatchNotifications', () => {
    it('should send multiple notifications', async () => {
      mockHeraldClient.post.mockResolvedValue({
        data: { success: true, notification: { id: 'notif-123' } }
      });

      const notifications = [
        { userId: 'user-1', type: 'like', title: 'Like', body: 'Someone liked your post' },
        { userId: 'user-2', type: 'like', title: 'Like', body: 'Someone liked your post' },
        { userId: 'user-3', type: 'like', title: 'Like', body: 'Someone liked your post' }
      ];

      const result = await heraldService.sendBatchNotifications(notifications);

      expect(result.success).toBe(true);
      expect(result.total).toBe(3);
      expect(result.succeeded).toBeGreaterThan(0);
    });

    it('should handle partial failures', async () => {
      let callCount = 0;

      mockHeraldClient.post.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Failed'));
        }
        return Promise.resolve({
          data: { success: true, notification: { id: `notif-${callCount}` } }
        });
      });

      const notifications = [
        { userId: 'user-1', type: 'like', title: 'Like', body: 'Test' },
        { userId: 'user-2', type: 'like', title: 'Like', body: 'Test' },
        { userId: 'user-3', type: 'like', title: 'Like', body: 'Test' }
      ];

      const result = await heraldService.sendBatchNotifications(notifications);

      expect(result.total).toBe(3);
      expect(result.failed).toBeGreaterThan(0);
    });
  });

  describe('checkHealth', () => {
    it('should return healthy status when Herald is reachable', async () => {
      mockHeraldClient.get.mockResolvedValue({
        status: 200,
        data: { status: 'healthy', service: 'exprsn-herald' }
      });

      const result = await heraldService.checkHealth();

      expect(result.status).toBe('connected');
      expect(result.healthy).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should return disconnected when Herald is unreachable', async () => {
      mockHeraldClient.get.mockRejectedValue(new Error('Connection refused'));

      const result = await heraldService.checkHealth();

      expect(result.status).toBe('disconnected');
      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
