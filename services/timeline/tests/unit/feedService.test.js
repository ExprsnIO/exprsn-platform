/**
 * ═══════════════════════════════════════════════════════════
 * Feed Service Tests
 * Test feed generation and ranking algorithms
 * ═══════════════════════════════════════════════════════════
 */

const feedService = require('../../src/services/feedService');
const { Post, Follow } = require('../../src/models');
const {
  createUser,
  createPost,
  createFollow,
  createPosts,
  createPopularPost
} = require('../fixtures/factories');

// Mock models
jest.mock('../../src/models');

describe('Feed Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getHomeFeed', () => {
    it('should fetch posts from followed users', async () => {
      const userId = 'user-1';
      const followingId = 'user-2';

      // Mock follows
      Follow.findAll.mockResolvedValue([
        { followingId }
      ]);

      // Mock posts
      const posts = createPosts(5, { userId: followingId });
      Post.findAll.mockResolvedValue(posts.map(p => ({
        toJSON: () => p,
        ...p
      })));

      const result = await feedService.getHomeFeed(userId, { limit: 20 });

      expect(Follow.findAll).toHaveBeenCalledWith({
        where: { followerId: userId },
        attributes: ['followingId']
      });

      expect(Post.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should include user own posts in feed', async () => {
      const userId = 'user-1';

      Follow.findAll.mockResolvedValue([]);

      const ownPosts = createPosts(3, { userId });
      Post.findAll.mockResolvedValue(ownPosts.map(p => ({
        toJSON: () => p,
        ...p
      })));

      const result = await feedService.getHomeFeed(userId, { limit: 20 });

      expect(result).toBeDefined();
      expect(Post.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: expect.objectContaining({
              $in: expect.arrayContaining([userId])
            })
          })
        })
      );
    });

    it('should rank posts by engagement score', async () => {
      const userId = 'user-1';

      Follow.findAll.mockResolvedValue([]);

      const posts = [
        createPost({ userId, likeCount: 10, repostCount: 5 }),
        createPost({ userId, likeCount: 100, repostCount: 50 }),
        createPost({ userId, likeCount: 5, repostCount: 1 })
      ];

      Post.findAll.mockResolvedValue(posts.map(p => ({
        toJSON: () => p,
        ...p,
        createdAt: new Date()
      })));

      const result = await feedService.getHomeFeed(userId, { limit: 20 });

      expect(result[0].likeCount).toBeGreaterThanOrEqual(result[1]?.likeCount || 0);
    });

    it('should respect limit parameter', async () => {
      const userId = 'user-1';

      Follow.findAll.mockResolvedValue([]);

      const posts = createPosts(50, { userId });
      Post.findAll.mockResolvedValue(posts.map(p => ({
        toJSON: () => p,
        ...p
      })));

      const result = await feedService.getHomeFeed(userId, { limit: 10 });

      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should support cursor-based pagination with where clause', async () => {
      const userId = 'user-1';
      const whereClause = {
        $or: [
          { createdAt: { $lt: new Date() } }
        ]
      };

      Follow.findAll.mockResolvedValue([]);
      Post.findAll.mockResolvedValue([]);

      await feedService.getHomeFeed(userId, {
        limit: 20,
        where: whereClause
      });

      expect(Post.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining(whereClause)
        })
      );
    });
  });

  describe('getUserTimeline', () => {
    it('should fetch posts for specific user', async () => {
      const userId = 'user-1';
      const posts = createPosts(10, { userId });

      Post.findAll.mockResolvedValue(posts);

      const result = await feedService.getUserTimeline(userId, { limit: 20 });

      expect(Post.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId
          })
        })
      );

      expect(result).toEqual(posts);
    });

    it('should order by creation date descending', async () => {
      const userId = 'user-1';

      Post.findAll.mockResolvedValue([]);

      await feedService.getUserTimeline(userId);

      expect(Post.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: expect.arrayContaining([
            ['createdAt', 'DESC']
          ])
        })
      );
    });

    it('should support cursor where clause', async () => {
      const userId = 'user-1';
      const whereClause = { createdAt: { $lt: new Date() } };

      Post.findAll.mockResolvedValue([]);

      await feedService.getUserTimeline(userId, { where: whereClause });

      expect(Post.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining(whereClause)
        })
      );
    });
  });

  describe('getExploreFeed', () => {
    it('should fetch diverse content for discovery', async () => {
      const posts = createPosts(20);

      Post.findAll.mockResolvedValue(posts);

      const result = await feedService.getExploreFeed({ limit: 20 });

      expect(Post.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('getTrendingPosts', () => {
    it('should fetch posts with high engagement', async () => {
      const posts = [
        createPopularPost(),
        createPopularPost(),
        createPopularPost()
      ];

      Post.findAll.mockResolvedValue(posts);

      const result = await feedService.getTrendingPosts({ limit: 10 });

      expect(Post.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      const userId = 'user-1';

      Follow.findAll.mockRejectedValue(new Error('Database error'));

      await expect(
        feedService.getHomeFeed(userId)
      ).rejects.toThrow('Database error');
    });

    it('should handle missing user', async () => {
      const userId = 'non-existent';

      Follow.findAll.mockResolvedValue([]);
      Post.findAll.mockResolvedValue([]);

      const result = await feedService.getHomeFeed(userId);

      expect(result).toEqual([]);
    });
  });
});
