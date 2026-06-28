/**
 * ═══════════════════════════════════════════════════════════
 * Appeals Integration Tests
 * ═══════════════════════════════════════════════════════════
 */

const appealService = require('../../services/appealService');
const { Appeal } = require('../../models/sequelize-index');
const {
  createTestModerationCase,
  createTestUserAction,
  createTestAppeal
} = require('./setup');

describe('Appeal Service Integration', () => {
  describe('submitAppeal', () => {
    it('should submit appeal for moderation decision', async () => {
      const moderationCase = await createTestModerationCase();
      await moderationCase.update({
        status: 'rejected',
        decision: 'rejected',
        userId: 'aaaaaaaa-0000-4000-8000-000000000456'
      });

      const appeal = await appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000456', {
        moderationItemId: moderationCase.id,
        reason: 'I believe this was flagged incorrectly',
        additionalInfo: 'Additional context here'
      });

      expect(appeal).toBeDefined();
      expect(appeal.userId).toBe('aaaaaaaa-0000-4000-8000-000000000456');
      expect(appeal.moderationItemId).toBe(moderationCase.id);
      expect(appeal.status).toBe('pending');
    });

    it('should submit appeal for user action', async () => {
      const userAction = await createTestUserAction();

      const appeal = await appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000456', {
        userActionId: userAction.id,
        reason: 'This action was unfair'
      });

      expect(appeal).toBeDefined();
      expect(appeal.userActionId).toBe(userAction.id);
      expect(appeal.status).toBe('pending');
    });

    it('should reject appeal with unauthorized user', async () => {
      const moderationCase = await createTestModerationCase();

      await expect(
        appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000009999', {
          moderationItemId: moderationCase.id,
          reason: 'Test appeal'
        })
      ).rejects.toThrow('Unauthorized');
    });

    it('should reject duplicate appeal', async () => {
      const moderationCase = await createTestModerationCase();
      await moderationCase.update({ userId: 'aaaaaaaa-0000-4000-8000-000000000456' });

      await appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000456', {
        moderationItemId: moderationCase.id,
        reason: 'First appeal'
      });

      await expect(
        appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000456', {
          moderationItemId: moderationCase.id,
          reason: 'Second appeal'
        })
      ).rejects.toThrow('already exists');
    });

    it('should require either moderation item or user action', async () => {
      await expect(
        appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000456', {
          reason: 'Invalid appeal'
        })
      ).rejects.toThrow('must target either');
    });
  });

  describe('reviewAppeal', () => {
    it('should approve appeal and reverse moderation decision', async () => {
      const moderationCase = await createTestModerationCase();
      await moderationCase.update({ userId: 'aaaaaaaa-0000-4000-8000-000000000456' });

      const appeal = await appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000456', {
        moderationItemId: moderationCase.id,
        reason: 'Appeal reason'
      });

      const reviewed = await appealService.reviewAppeal(
        appeal.id,
        'cccccccc-0000-4000-8000-000000000123',
        'approve',
        'Appeal is valid, reversing decision'
      );

      expect(reviewed.status).toBe('approved');
      expect(reviewed.reviewedBy).toBe('cccccccc-0000-4000-8000-000000000123');
      expect(reviewed.reviewedAt).toBeDefined();

      // Check if moderation item was updated
      await moderationCase.reload();
      expect(moderationCase.status).toBe('appealed');
    });

    it('should deny appeal', async () => {
      const moderationCase = await createTestModerationCase();
      await moderationCase.update({ userId: 'aaaaaaaa-0000-4000-8000-000000000456' });

      const appeal = await appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000456', {
        moderationItemId: moderationCase.id,
        reason: 'Appeal reason'
      });

      const reviewed = await appealService.reviewAppeal(
        appeal.id,
        'cccccccc-0000-4000-8000-000000000123',
        'deny',
        'Original decision stands'
      );

      expect(reviewed.status).toBe('denied');
      expect(reviewed.reviewedBy).toBe('cccccccc-0000-4000-8000-000000000123');
    });

    it('should revoke user action on appeal approval', async () => {
      const userAction = await createTestUserAction();

      const appeal = await appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000456', {
        userActionId: userAction.id,
        reason: 'Unfair action'
      });

      await appealService.reviewAppeal(
        appeal.id,
        'cccccccc-0000-4000-8000-000000000123',
        'approve',
        'Action revoked'
      );

      // Check if user action was revoked
      await userAction.reload();
      expect(userAction.active).toBe(false);
    });

    it('should reject review of already reviewed appeal', async () => {
      const moderationCase = await createTestModerationCase();
      await moderationCase.update({ userId: 'aaaaaaaa-0000-4000-8000-000000000456' });

      const appeal = await appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000456', {
        moderationItemId: moderationCase.id,
        reason: 'Appeal reason'
      });

      await appealService.reviewAppeal(
        appeal.id,
        'cccccccc-0000-4000-8000-000000000123',
        'approve',
        'Approved'
      );

      await expect(
        appealService.reviewAppeal(
          appeal.id,
          'cccccccc-0000-4000-8000-000000000456',
          'deny',
          'Denied'
        )
      ).rejects.toThrow('already been reviewed');
    });
  });

  describe('getAppealsForUser', () => {
    it('should retrieve all appeals for user', async () => {
      const case1 = await createTestModerationCase();
      const case2 = await createTestModerationCase();
      await case1.update({ userId: 'aaaaaaaa-0000-4000-8000-000000000456' });
      await case2.update({ userId: 'aaaaaaaa-0000-4000-8000-000000000456' });

      await appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000456', {
        moderationItemId: case1.id,
        reason: 'Appeal 1'
      });

      await appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000456', {
        moderationItemId: case2.id,
        reason: 'Appeal 2'
      });

      const appeals = await appealService.getAppealsForUser('aaaaaaaa-0000-4000-8000-000000000456');

      expect(appeals).toHaveLength(2);
    });

    it('should filter appeals by status', async () => {
      const moderationCase = await createTestModerationCase();
      await moderationCase.update({ userId: 'aaaaaaaa-0000-4000-8000-000000000456' });

      const appeal1 = await appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000456', {
        moderationItemId: moderationCase.id,
        reason: 'Appeal 1'
      });

      await appealService.reviewAppeal(
        appeal1.id,
        'cccccccc-0000-4000-8000-000000000123',
        'approve',
        'Approved'
      );

      const pendingAppeals = await appealService.getAppealsForUser('aaaaaaaa-0000-4000-8000-000000000456', {
        status: 'pending'
      });

      const approvedAppeals = await appealService.getAppealsForUser('aaaaaaaa-0000-4000-8000-000000000456', {
        status: 'approved'
      });

      expect(pendingAppeals).toHaveLength(0);
      expect(approvedAppeals).toHaveLength(1);
    });
  });

  describe('getPendingAppeals', () => {
    it('should retrieve all pending appeals', async () => {
      const case1 = await createTestModerationCase();
      const case2 = await createTestModerationCase();
      await case1.update({ userId: 'aaaaaaaa-0000-4000-8000-000000000001' });
      await case2.update({ userId: 'aaaaaaaa-0000-4000-8000-000000000002' });

      await appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000001', {
        moderationItemId: case1.id,
        reason: 'Appeal 1'
      });

      await appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000002', {
        moderationItemId: case2.id,
        reason: 'Appeal 2'
      });

      const pending = await appealService.getPendingAppeals();

      expect(pending.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getAppealStats', () => {
    it('should calculate appeal statistics', async () => {
      const case1 = await createTestModerationCase();
      const case2 = await createTestModerationCase();
      const case3 = await createTestModerationCase();
      await case1.update({ userId: 'aaaaaaaa-0000-4000-8000-000000000001' });
      await case2.update({ userId: 'aaaaaaaa-0000-4000-8000-000000000002' });
      await case3.update({ userId: 'aaaaaaaa-0000-4000-8000-000000000003' });

      const appeal1 = await appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000001', {
        moderationItemId: case1.id,
        reason: 'Appeal 1'
      });

      const appeal2 = await appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000002', {
        moderationItemId: case2.id,
        reason: 'Appeal 2'
      });

      await appealService.submitAppeal('aaaaaaaa-0000-4000-8000-000000000003', {
        moderationItemId: case3.id,
        reason: 'Appeal 3'
      });

      await appealService.reviewAppeal(
        appeal1.id,
        'cccccccc-0000-4000-8000-000000000123',
        'approve',
        'Approved'
      );

      await appealService.reviewAppeal(
        appeal2.id,
        'cccccccc-0000-4000-8000-000000000123',
        'deny',
        'Denied'
      );

      const stats = await appealService.getAppealStats();

      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.approved).toBe(1);
      expect(stats.denied).toBe(1);
      expect(stats.approvalRate).toBeGreaterThan(0);
    });
  });
});
