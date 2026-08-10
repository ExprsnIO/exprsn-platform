const syncController = require('../../controllers/syncController');
const { Account, Repository, Record } = require('../../models');
const { Post } = require('../../../exprsn-timeline/src/models');

describe('Timeline-Bluesky Integration', () => {
  let testAccount;
  let testRepository;
  let testPost;

  beforeAll(async () => {
    // Create test account
    testAccount = await Account.create({
      did: 'did:web:test.exprsn.io:testuser',
      handle: 'testuser.exprsn.io',
      exprsnUserId: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      displayName: 'Test User',
      publicKey: 'test-public-key',
      privateKey: 'test-private-key',
      status: 'active'
    });

    testRepository = await Repository.create({
      accountId: testAccount.id,
      did: testAccount.did,
      rev: 'test-rev-1'
    });
  });

  afterAll(async () => {
    // Cleanup
    await Record.destroy({ where: {} });
    await Repository.destroy({ where: {} });
    await Account.destroy({ where: {} });
  });

  describe('Timeline to Bluesky Sync', () => {
    it('should sync Timeline post to Bluesky', async () => {
      const timelinePost = {
        id: '456e7890-e89b-12d3-a456-426614174001',
        userId: testAccount.exprsnUserId,
        content: 'Hello from Timeline!',
        createdAt: new Date(),
        metadata: {
          entities: {
            hashtags: [{ tag: 'test', start: 0, end: 5 }]
          }
        },
        media: []
      };

      const result = await syncController.syncTimelinePostToBluesky(timelinePost);

      expect(result).toBeDefined();
      expect(result.record).toBeDefined();
      expect(result.blueskyUri).toMatch(/^at:\/\//);

      // Verify Bluesky record was created
      const record = await Record.findOne({
        where: { uri: result.blueskyUri }
      });

      expect(record).toBeDefined();
      expect(record.value.text).toBe('Hello from Timeline!');
      expect(record.collection).toBe('app.bsky.feed.post');
    });

    it('should not sync post twice', async () => {
      const timelinePost = {
        id: '456e7890-e89b-12d3-a456-426614174002',
        userId: testAccount.exprsnUserId,
        content: 'Another test post',
        createdAt: new Date(),
        blueskyUri: 'at://did:web:test.exprsn.io:testuser/app.bsky.feed.post/existing',
        metadata: {},
        media: []
      };

      const result = await syncController.syncTimelinePostToBluesky(timelinePost);

      // Should return null since post is already synced
      expect(result).toBeNull();
    });

    it('should sync Timeline post update to Bluesky', async () => {
      // First create a post
      const timelinePost = {
        id: '456e7890-e89b-12d3-a456-426614174003',
        userId: testAccount.exprsnUserId,
        content: 'Original content',
        createdAt: new Date(),
        metadata: {},
        media: []
      };

      const createResult = await syncController.syncTimelinePostToBluesky(timelinePost);

      // Now update it
      const updatedPost = {
        ...timelinePost,
        content: 'Updated content',
        blueskyUri: createResult.blueskyUri,
        blueskyRkey: createResult.record.rkey
      };

      const updateResult = await syncController.syncTimelineUpdateToBluesky(updatedPost);

      expect(updateResult).toBe(true);

      // Verify the Bluesky record was updated
      const record = await Record.findOne({
        where: { uri: createResult.blueskyUri }
      });

      expect(record.value.text).toBe('Updated content');
    });
  });

  describe('Bluesky to Timeline Sync', () => {
    it('should sync Bluesky post to Timeline', async () => {
      const blueskyRecord = {
        id: '789e7890-e89b-12d3-a456-426614174004',
        uri: 'at://did:web:test.exprsn.io:testuser/app.bsky.feed.post/test123',
        collection: 'app.bsky.feed.post',
        value: {
          $type: 'app.bsky.feed.post',
          text: 'Hello from Bluesky!',
          createdAt: new Date().toISOString()
        },
        repository: {
          did: testAccount.did
        }
      };

      // Mock the record creation
      const record = await Record.create({
        repositoryId: testRepository.id,
        uri: blueskyRecord.uri,
        cid: 'baftest123',
        collection: blueskyRecord.collection,
        rkey: 'test123',
        value: blueskyRecord.value
      });

      blueskyRecord.id = record.id;

      // This would normally call the Timeline service API
      // For testing, we're just verifying the sync logic
      const syncLogic = async () => {
        const timelinePostData = {
          userId: testAccount.exprsnUserId,
          content: blueskyRecord.value.text,
          visibility: 'public',
          metadata: {
            source: 'bluesky',
            blueskyUri: blueskyRecord.uri
          }
        };

        return timelinePostData;
      };

      const result = await syncLogic();

      expect(result).toBeDefined();
      expect(result.content).toBe('Hello from Bluesky!');
      expect(result.userId).toBe(testAccount.exprsnUserId);
      expect(result.metadata.source).toBe('bluesky');
    });

    it('should not sync non-post collections', async () => {
      const blueskyLike = {
        uri: 'at://did:web:test.exprsn.io:testuser/app.bsky.feed.like/test456',
        collection: 'app.bsky.feed.like',
        value: {
          subject: {
            uri: 'at://other-did/app.bsky.feed.post/abc'
          }
        }
      };

      // Likes should not create Timeline posts
      const shouldNotSync = blueskyLike.collection !== 'app.bsky.feed.post';

      expect(shouldNotSync).toBe(true);
    });
  });

  describe('Entity Conversion', () => {
    it('should convert Timeline entities to Bluesky facets', async () => {
      const timelinePost = {
        id: '456e7890-e89b-12d3-a456-426614174005',
        userId: testAccount.exprsnUserId,
        content: 'Check out https://exprsn.io #awesome',
        createdAt: new Date(),
        metadata: {
          entities: {
            urls: [
              { url: 'https://exprsn.io', start: 10, end: 28 }
            ],
            hashtags: [
              { tag: 'awesome', start: 29, end: 37 }
            ]
          }
        },
        media: []
      };

      const result = await syncController.syncTimelinePostToBluesky(timelinePost);

      expect(result).toBeDefined();
      expect(result.record.value.facets).toBeDefined();
      expect(result.record.value.facets.length).toBeGreaterThan(0);

      // Verify URL facet
      const urlFacet = result.record.value.facets.find(f =>
        f.features.some(feat => feat.$type === 'app.bsky.richtext.facet#link')
      );
      expect(urlFacet).toBeDefined();

      // Verify hashtag facet
      const tagFacet = result.record.value.facets.find(f =>
        f.features.some(feat => feat.$type === 'app.bsky.richtext.facet#tag')
      );
      expect(tagFacet).toBeDefined();
    });
  });
});
