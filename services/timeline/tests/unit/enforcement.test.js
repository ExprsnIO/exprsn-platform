/**
 * ═══════════════════════════════════════════════════════════
 * FEAT-011 Read-path enforcement tests (R1/R2/R3 + search R16)
 * DB-free: models and the relationship façade are mocked. Proves the feed
 * services apply the block/mute suppression set via [Op.notIn] (never a per-post
 * pairwise check), and that an EMPTY suppression set adds NO filter (no perf
 * regression / no N+1 when the viewer has no relationships).
 *
 * The set contents themselves (block both directions ∪ unexpired-own-mute, with
 * expired mutes excluded) are proven in relationshipService.test.js; here we
 * prove the read paths consume that set correctly.
 * ═══════════════════════════════════════════════════════════
 */

jest.mock('../../src/models', () => ({
  Post: { findAll: jest.fn() },
  Follow: { findAll: jest.fn() },
  Like: { findAll: jest.fn() },
  Repost: { findAll: jest.fn() }
}));

// R16: capture the Elasticsearch query body. searchPosts calls its module-local
// getClient()/new Client() internally, so intercept at the @elastic client.
const mockEsSearch = jest.fn();
// Client is a PLAIN function (not a jest.fn) so resetMocks can't wipe its
// implementation; its search delegates to the mockEsSearch spy.
jest.mock('@elastic/elasticsearch', () => ({
  Client: function ElasticClientMock() {
    return { search: (...args) => mockEsSearch(...args), close: () => {} };
  }
}));

jest.mock('../../src/services/relationshipService', () => ({
  getSuppressedIds: jest.fn(),
  isBlockedEitherWay: jest.fn()
}));

const { Op } = require('sequelize');
const feedService = require('../../src/services/feedService');
const elasticsearchService = require('../../src/services/elasticsearchService');
const relationshipService = require('../../src/services/relationshipService');
const { Post, Follow } = require('../../src/models');

const VIEWER = 'viewer-1';

describe('FEAT-011 read-path enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    relationshipService.getSuppressedIds.mockResolvedValue([]);
    relationshipService.isBlockedEitherWay.mockResolvedValue(false);
    Follow.findAll.mockResolvedValue([]);
    Post.findAll.mockResolvedValue([]);
  });

  describe('R1 home feed', () => {
    it('excludes suppressed authors via [Op.notIn] (block either way and mute)', async () => {
      relationshipService.getSuppressedIds.mockResolvedValue(['blocked-user', 'muted-user']);

      await feedService.getHomeFeed(VIEWER, { limit: 20 });

      expect(relationshipService.getSuppressedIds).toHaveBeenCalledTimes(1);
      expect(relationshipService.getSuppressedIds).toHaveBeenCalledWith(VIEWER);

      const where = Post.findAll.mock.calls[0][0].where;
      expect(where.userId[Op.in]).toEqual([VIEWER]); // own + followed
      expect(where.userId[Op.notIn]).toEqual(['blocked-user', 'muted-user']);
    });

    it('adds NO notIn filter when nothing is suppressed (no regression)', async () => {
      relationshipService.getSuppressedIds.mockResolvedValue([]);

      await feedService.getHomeFeed(VIEWER, { limit: 20 });

      const where = Post.findAll.mock.calls[0][0].where;
      expect(where.userId[Op.in]).toEqual([VIEWER]);
      expect(where.userId[Op.notIn]).toBeUndefined();
    });

    it('issues exactly ONE suppression query per request (never per post)', async () => {
      Follow.findAll.mockResolvedValue([{ followingId: 'f1' }, { followingId: 'f2' }]);
      relationshipService.getSuppressedIds.mockResolvedValue(['x']);

      await feedService.getHomeFeed(VIEWER, { limit: 20 });

      expect(relationshipService.getSuppressedIds).toHaveBeenCalledTimes(1);
      expect(relationshipService.isBlockedEitherWay).not.toHaveBeenCalled();
    });
  });

  describe('R2 user timeline / profile', () => {
    it('returns [] (no Post query) when the viewer is blocked either way', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(true);

      const result = await feedService.getUserTimeline('owner-9', { viewerId: VIEWER });

      expect(result).toEqual([]);
      expect(relationshipService.isBlockedEitherWay).toHaveBeenCalledWith(VIEWER, 'owner-9');
      expect(Post.findAll).not.toHaveBeenCalled();
    });

    it('serves the profile normally when not blocked (mute does not empty a profile)', async () => {
      relationshipService.isBlockedEitherWay.mockResolvedValue(false);

      await feedService.getUserTimeline('owner-9', { viewerId: VIEWER });

      expect(Post.findAll).toHaveBeenCalled();
    });

    it('skips the check when no viewer is supplied (internal/unauthenticated)', async () => {
      await feedService.getUserTimeline('owner-9', {});
      expect(relationshipService.isBlockedEitherWay).not.toHaveBeenCalled();
      expect(Post.findAll).toHaveBeenCalled();
    });
  });

  describe('R3 explore feed', () => {
    it('applies [Op.notIn] for the viewer', async () => {
      relationshipService.getSuppressedIds.mockResolvedValue(['blk']);

      await feedService.getExploreFeed({ limit: 20, viewerId: VIEWER });

      const where = Post.findAll.mock.calls[0][0].where;
      expect(where.userId[Op.notIn]).toEqual(['blk']);
    });

    it('does not query the façade when no viewer is supplied', async () => {
      await feedService.getExploreFeed({ limit: 20 });
      expect(relationshipService.getSuppressedIds).not.toHaveBeenCalled();
    });
  });

  describe('R16 Elasticsearch must_not', () => {
    const config = require('../../src/config');

    it('adds a must_not terms filter on suppressed authors', async () => {
      config.elasticsearch.enabled = true; // setup.js disables it by default
      elasticsearchService.closeClient(); // drop any cached client so initClient re-runs
      mockEsSearch.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });

      await elasticsearchService.searchPosts('hello', {
        filters: { excludeUserIds: ['blk-1', 'blk-2'] }
      });

      const body = mockEsSearch.mock.calls[0][0];
      expect(body.query.bool.must_not).toEqual([
        { terms: { userId: ['blk-1', 'blk-2'] } }
      ]);
    });

    it('omits must_not when nothing is excluded', async () => {
      config.elasticsearch.enabled = true;
      elasticsearchService.closeClient();
      mockEsSearch.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });

      await elasticsearchService.searchPosts('hello', { filters: {} });

      const body = mockEsSearch.mock.calls[0][0];
      expect(body.query.bool.must_not).toEqual([]);
    });
  });
});
