/**
 * ═══════════════════════════════════════════════════════════
 * Relationship Service Tests (FEAT-011)
 * Block/mute façade — DB-free, models mocked with jest.fn() statics.
 * ═══════════════════════════════════════════════════════════
 */

// Manual model factory (auto-mocking the index does not reliably mock
// Sequelize static methods — same pattern as feedService.test.js).
jest.mock('../../src/models', () => ({
  UserRelationship: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findOrCreate: jest.fn(),
    destroy: jest.fn()
  },
  Follow: {
    destroy: jest.fn()
  }
}));

const { Op } = require('sequelize');
const relationshipService = require('../../src/services/relationshipService');
const { UserRelationship, Follow } = require('../../src/models');

const VIEWER = 'viewer-1';

describe('relationshipService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSuppressedIds', () => {
    it('includes bidirectional blocks and own mutes; maps each row to the OTHER user id', async () => {
      UserRelationship.findAll.mockResolvedValue([
        { actorId: VIEWER, targetId: 'b', type: 'block' },   // outgoing block  -> b
        { actorId: 'c', targetId: VIEWER, type: 'block' },   // incoming block  -> c
        { actorId: VIEWER, targetId: 'd', type: 'mute' }     // own mute        -> d
      ]);

      const ids = await relationshipService.getSuppressedIds(VIEWER);

      expect(ids.sort()).toEqual(['b', 'c', 'd']);
    });

    it('issues exactly ONE query (no N+1)', async () => {
      UserRelationship.findAll.mockResolvedValue([]);
      await relationshipService.getSuppressedIds(VIEWER);
      expect(UserRelationship.findAll).toHaveBeenCalledTimes(1);
    });

    it('applies the EXPIRED-MUTE predicate in the query so expired mutes stop suppressing', async () => {
      UserRelationship.findAll.mockResolvedValue([]);
      await relationshipService.getSuppressedIds(VIEWER);

      const where = UserRelationship.findAll.mock.calls[0][0].where;
      // Top-level: outgoing-edge branch OR incoming-block branch.
      const [outgoing, incoming] = where[Op.or];

      // Outgoing branch: actorId=viewer AND (block OR unexpired-mute).
      expect(outgoing.actorId).toBe(VIEWER);
      const [blockClause, muteClause] = outgoing[Op.or];
      expect(blockClause).toEqual({ type: 'block' });
      expect(muteClause.type).toBe('mute');
      // Unexpired-mute: expiresAt IS NULL OR expiresAt > now()
      const [nullClause, gtClause] = muteClause[Op.or];
      expect(nullClause).toEqual({ expiresAt: null });
      expect(gtClause.expiresAt[Op.gt]).toBeInstanceOf(Date);

      // Incoming branch is block-only — an incoming MUTE must NOT suppress.
      expect(incoming).toEqual({ targetId: VIEWER, type: 'block' });
    });

    it('returns [] for a missing viewer without querying', async () => {
      const ids = await relationshipService.getSuppressedIds(undefined);
      expect(ids).toEqual([]);
      expect(UserRelationship.findAll).not.toHaveBeenCalled();
    });

    it('dedupes when a user is both blocked and (incoming) blocking', async () => {
      UserRelationship.findAll.mockResolvedValue([
        { actorId: VIEWER, targetId: 'x', type: 'block' },
        { actorId: 'x', targetId: VIEWER, type: 'block' }
      ]);
      const ids = await relationshipService.getSuppressedIds(VIEWER);
      expect(ids).toEqual(['x']);
    });
  });

  describe('isBlockedEitherWay', () => {
    it('is symmetric for block (queries both directions, type=block)', async () => {
      UserRelationship.findOne.mockResolvedValue({ id: 'rel-1' });

      expect(await relationshipService.isBlockedEitherWay('a', 'b')).toBe(true);

      const where = UserRelationship.findOne.mock.calls[0][0].where;
      expect(where.type).toBe('block');
      expect(where[Op.or]).toEqual([
        { actorId: 'a', targetId: 'b' },
        { actorId: 'b', targetId: 'a' }
      ]);
    });

    it('returns false when no block edge exists', async () => {
      UserRelationship.findOne.mockResolvedValue(null);
      expect(await relationshipService.isBlockedEitherWay('a', 'b')).toBe(false);
    });

    it('returns false for self / missing ids without querying', async () => {
      expect(await relationshipService.isBlockedEitherWay('a', 'a')).toBe(false);
      expect(await relationshipService.isBlockedEitherWay('a', null)).toBe(false);
      expect(UserRelationship.findOne).not.toHaveBeenCalled();
    });

    it('canContact is the inverse of isBlockedEitherWay', async () => {
      UserRelationship.findOne.mockResolvedValue({ id: 'rel-1' });
      expect(await relationshipService.canContact('a', 'b')).toBe(false);
      UserRelationship.findOne.mockResolvedValue(null);
      expect(await relationshipService.canContact('a', 'b')).toBe(true);
    });
  });

  describe('block', () => {
    it('creates the block edge and breaks the follow in BOTH directions', async () => {
      UserRelationship.findOrCreate.mockResolvedValue([{ id: 'rel-1' }, true]);
      Follow.destroy.mockResolvedValue(2);

      await relationshipService.block('a', 'b');

      expect(UserRelationship.findOrCreate).toHaveBeenCalledWith(expect.objectContaining({
        where: { actorId: 'a', targetId: 'b', type: 'block' }
      }));
      const followWhere = Follow.destroy.mock.calls[0][0].where;
      expect(followWhere[Op.or]).toEqual([
        { followerId: 'a', followingId: 'b' },
        { followerId: 'b', followingId: 'a' }
      ]);
    });

    it('rejects self-block (400 backstop)', async () => {
      await expect(relationshipService.block('a', 'a')).rejects.toThrow(/yourself/);
      expect(UserRelationship.findOrCreate).not.toHaveBeenCalled();
    });
  });

  describe('mute', () => {
    it('creates a mute with expiresAt and does NOT break follows', async () => {
      const expiresAt = new Date(Date.now() + 3600_000);
      UserRelationship.findOrCreate.mockResolvedValue([{ id: 'rel-2' }, true]);

      await relationshipService.mute('a', 'b', { expiresAt });

      expect(UserRelationship.findOrCreate).toHaveBeenCalledWith(expect.objectContaining({
        where: { actorId: 'a', targetId: 'b', type: 'mute' },
        defaults: expect.objectContaining({ expiresAt })
      }));
      expect(Follow.destroy).not.toHaveBeenCalled();
    });

    it('updates expiresAt when the mute already exists', async () => {
      const existing = { id: 'rel-2', expiresAt: null, save: jest.fn() };
      const newExpiry = new Date(Date.now() + 7200_000);
      UserRelationship.findOrCreate.mockResolvedValue([existing, false]);

      await relationshipService.mute('a', 'b', { expiresAt: newExpiry });

      expect(existing.expiresAt).toBe(newExpiry);
      expect(existing.save).toHaveBeenCalled();
    });

    it('rejects self-mute', async () => {
      await expect(relationshipService.mute('a', 'a', {})).rejects.toThrow(/yourself/);
    });
  });

  describe('unblock / unmute', () => {
    it('unblock destroys only the block edge (does not touch follows)', async () => {
      UserRelationship.destroy.mockResolvedValue(1);
      await relationshipService.unblock('a', 'b');
      expect(UserRelationship.destroy).toHaveBeenCalledWith({
        where: { actorId: 'a', targetId: 'b', type: 'block' }
      });
      expect(Follow.destroy).not.toHaveBeenCalled();
    });

    it('unmute destroys only the mute edge', async () => {
      UserRelationship.destroy.mockResolvedValue(1);
      await relationshipService.unmute('a', 'b');
      expect(UserRelationship.destroy).toHaveBeenCalledWith({
        where: { actorId: 'a', targetId: 'b', type: 'mute' }
      });
    });
  });

  describe('listRelationships / getBlockedByIds', () => {
    it('lists only the actor OWN outgoing edges, filtered by type', async () => {
      UserRelationship.findAll.mockResolvedValue([{ id: 'r1' }]);
      await relationshipService.listRelationships('a', { type: 'block' });
      const arg = UserRelationship.findAll.mock.calls[0][0];
      expect(arg.where).toEqual({ actorId: 'a', type: 'block' });
    });

    it('getBlockedByIds queries incoming blocks (internal, never client-facing)', async () => {
      UserRelationship.findAll.mockResolvedValue([{ actorId: 'c' }]);
      const ids = await relationshipService.getBlockedByIds(VIEWER);
      expect(ids).toEqual(['c']);
      expect(UserRelationship.findAll.mock.calls[0][0].where).toEqual({ targetId: VIEWER, type: 'block' });
    });
  });
});
