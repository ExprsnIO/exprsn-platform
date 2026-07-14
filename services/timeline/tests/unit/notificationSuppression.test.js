/**
 * ═══════════════════════════════════════════════════════════
 * FEAT-011 producer-side notification suppression (N1a + N1b)
 *
 * N1a — heraldService.notifyInteraction (like/comment/reply/repost/follow):
 *       drop when the actor is suppressed for the recipient.
 * N1b — processBatchNotificationJob (the MENTION path, runs in worker:timeline):
 *       drop mention recipients who have blocked/muted the mentioner. This is
 *       the finding-10 leak the ADR closes — a guard only at N1a would still let
 *       a blocked user's @mention light the target's bell.
 *
 * File-level mocks (jest.mock is hoisted per file): axios (so heraldService's
 * captured client is controllable) and relationshipService (the façade). N1b
 * spies on the REAL heraldService.sendBatchNotifications so we can inspect the
 * post-suppression recipient list.
 * ═══════════════════════════════════════════════════════════
 */

const mockHeraldClient = {
  post: jest.fn(),
  get: jest.fn(),
  interceptors: { request: { use: jest.fn() } }
};
jest.mock('axios', () => ({ create: jest.fn(() => mockHeraldClient) }));
jest.mock('../../src/services/relationshipService', () => ({
  getSuppressedIds: jest.fn()
}));

const heraldService = require('../../src/services/heraldService');
const { processBatchNotificationJob } = require('../../src/jobs/processors/notificationProcessor');
const relationshipService = require('../../src/services/relationshipService');
const config = require('../../src/config');

describe('N1a heraldService.notifyInteraction suppression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config.herald.enabled = true;
    mockHeraldClient.post.mockResolvedValue({ data: { success: true, notification: { id: 'n1' } } });
  });

  it('drops the notification when the actor is suppressed for the recipient', async () => {
    relationshipService.getSuppressedIds.mockResolvedValue(['actor-456']); // recipient blocked/muted actor

    const result = await heraldService.notifyInteraction('like', 'recipient-123', 'actor-456', { id: 'p1' });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/suppressed/i);
    expect(mockHeraldClient.post).not.toHaveBeenCalled();
    expect(relationshipService.getSuppressedIds).toHaveBeenCalledWith('recipient-123');
  });

  it('sends the notification when the actor is NOT suppressed', async () => {
    relationshipService.getSuppressedIds.mockResolvedValue([]);

    const result = await heraldService.notifyInteraction('like', 'recipient-123', 'actor-456', { id: 'p1' });

    expect(result.success).toBe(true);
    expect(mockHeraldClient.post).toHaveBeenCalled();
  });

  it('fails CLOSED (drops) if the suppression check throws', async () => {
    relationshipService.getSuppressedIds.mockRejectedValue(new Error('db down'));

    const result = await heraldService.notifyInteraction('like', 'recipient-123', 'actor-456', { id: 'p1' });

    expect(result.success).toBe(false);
    expect(mockHeraldClient.post).not.toHaveBeenCalled();
  });
});

describe('N1b processBatchNotificationJob mention suppression (worker path)', () => {
  let sendSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    config.herald.enabled = true;
    sendSpy = jest.spyOn(heraldService, 'sendBatchNotifications')
      .mockResolvedValue({ total: 0, succeeded: 0, failed: 0 });
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  it('drops a mention recipient who has blocked/muted the mentioner, keeps others', async () => {
    relationshipService.getSuppressedIds.mockImplementation(async (recipientId) =>
      recipientId === 'r-blocked' ? ['mentioner-1'] : []
    );

    await processBatchNotificationJob({
      id: 'job-1',
      data: {
        notifications: [
          { type: 'mention', recipientId: 'r-blocked', actorId: 'mentioner-1', postId: 'p1', data: {} },
          { type: 'mention', recipientId: 'r-ok', actorId: 'mentioner-1', postId: 'p1', data: {} }
        ]
      }
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const delivered = sendSpy.mock.calls[0][0];
    const recipients = delivered.map(n => n.userId);
    expect(recipients).toEqual(['r-ok']);
    expect(recipients).not.toContain('r-blocked');
  });

  it('delivers to everyone when nothing is suppressed', async () => {
    relationshipService.getSuppressedIds.mockResolvedValue([]);

    await processBatchNotificationJob({
      id: 'job-2',
      data: {
        notifications: [
          { type: 'mention', recipientId: 'a', actorId: 'm', postId: 'p', data: {} },
          { type: 'mention', recipientId: 'b', actorId: 'm', postId: 'p', data: {} }
        ]
      }
    });

    const delivered = sendSpy.mock.calls[0][0];
    expect(delivered.map(n => n.userId).sort()).toEqual(['a', 'b']);
  });

  it('fails CLOSED (drops) a mention with no resolvable recipientId (producer emitted only a username)', async () => {
    // The real producer (postService.queuePostJobs) emits recipientUsername and
    // NO recipientId; such a mention is neither deliverable nor suppression-
    // checkable, so it must be dropped — and getSuppressedIds must not be called
    // with an undefined recipient.
    relationshipService.getSuppressedIds.mockResolvedValue([]);

    await processBatchNotificationJob({
      id: 'job-username-only',
      data: {
        notifications: [
          { type: 'mention', recipientUsername: 'alice', actorId: 'm', postId: 'p', data: {} },
          { type: 'mention', recipientId: 'r-ok', actorId: 'm', postId: 'p', data: {} }
        ]
      }
    });

    const delivered = sendSpy.mock.calls[0][0];
    expect(delivered.map(n => n.userId)).toEqual(['r-ok']);
    expect(relationshipService.getSuppressedIds).not.toHaveBeenCalledWith(undefined);
  });

  it('fails CLOSED (drops that recipient) if the suppression check throws', async () => {
    relationshipService.getSuppressedIds.mockRejectedValue(new Error('db down'));

    await processBatchNotificationJob({
      id: 'job-3',
      data: {
        notifications: [
          { type: 'mention', recipientId: 'a', actorId: 'm', postId: 'p', data: {} }
        ]
      }
    });

    const delivered = sendSpy.mock.calls[0][0];
    expect(delivered).toEqual([]);
  });
});
