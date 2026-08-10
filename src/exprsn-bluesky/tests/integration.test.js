const request = require('supertest');
const { sequelize } = require('../models');
const { Account, Repository, Record } = require('../models');
const didService = require('../services/didService');
const sessionService = require('../services/sessionService');
const cacheService = require('../services/cacheService');

// Mock external services
jest.mock('axios');
const axios = require('axios');

describe('BlueSky Service Integration Tests', () => {
  let app;
  let testAccount;
  let testSession;
  let accessToken;

  beforeAll(async () => {
    // Import app after mocks are set up
    app = require('../index');

    // Sync database
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    // Clear database
    await Record.destroy({ where: {} });
    await Repository.destroy({ where: {} });
    await Account.destroy({ where: {} });

    // Clear cache
    await cacheService.invalidateUserCache('*');
  });

  describe('Complete User Journey: Account Creation to Content Publishing', () => {
    it('should complete full user lifecycle', async () => {
      // Step 1: Create account via DID service
      const accountData = await didService.createAccount({
        username: 'testuser',
        email: 'test@example.com',
        exprsnUserId: 'exprsn-user-123',
        displayName: 'Test User',
        description: 'Integration test account'
      });

      expect(accountData.account).toBeDefined();
      expect(accountData.account.did).toMatch(/^did:web:/);
      expect(accountData.account.handle).toBe('testuser.exprsn.io');
      expect(accountData.repository).toBeDefined();

      testAccount = accountData.account;

      // Step 2: Mock auth service response for session creation
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            id: testAccount.exprsnUserId,
            email: testAccount.email
          }
        }
      });

      // Step 3: Create session
      const session = await sessionService.createSession(
        testAccount.did,
        testAccount.exprsnUserId
      );

      expect(session).toBeDefined();
      expect(session.accessJwt).toBeDefined();
      expect(session.refreshJwt).toBeDefined();
      expect(session.did).toBe(testAccount.did);

      accessToken = session.accessJwt;

      // Step 4: Verify DID document resolution
      const didDoc = await didService.resolveDID(testAccount.did);
      expect(didDoc).toBeDefined();
      expect(didDoc.id).toBe(testAccount.did);
      expect(didDoc.verificationMethod).toHaveLength(1);

      // Step 5: Create a post record
      const postRecord = await Record.create({
        repositoryId: accountData.repository.id,
        did: testAccount.did,
        collection: 'app.bsky.feed.post',
        rkey: 'test-post-1',
        cid: 'bafyreigtest123',
        record: {
          text: 'Hello from BlueSky integration test!',
          createdAt: new Date().toISOString()
        }
      });

      expect(postRecord).toBeDefined();
      expect(postRecord.collection).toBe('app.bsky.feed.post');

      // Step 6: Verify repository was updated
      await accountData.repository.reload();
      expect(accountData.repository.recordCount).toBe(1);
      expect(accountData.repository.commitCount).toBe(1);
    });
  });

  describe('Feed Integration', () => {
    beforeEach(async () => {
      // Create test account
      const accountData = await didService.createAccount({
        username: 'feeduser',
        email: 'feed@example.com',
        exprsnUserId: 'exprsn-feed-user',
        displayName: 'Feed Test User'
      });

      testAccount = accountData.account;

      // Create session
      const session = await sessionService.createSession(
        testAccount.did,
        testAccount.exprsnUserId
      );
      accessToken = session.accessJwt;

      // Mock timeline service response
      axios.get.mockResolvedValue({
        data: {
          success: true,
          data: {
            posts: [
              {
                id: 'post-1',
                userId: testAccount.exprsnUserId,
                content: 'Test post 1',
                createdAt: new Date().toISOString(),
                user: {
                  id: testAccount.exprsnUserId,
                  username: 'feeduser',
                  displayName: 'Feed Test User'
                }
              },
              {
                id: 'post-2',
                userId: testAccount.exprsnUserId,
                content: 'Test post 2',
                createdAt: new Date().toISOString(),
                user: {
                  id: testAccount.exprsnUserId,
                  username: 'feeduser',
                  displayName: 'Feed Test User'
                }
              }
            ],
            cursor: 'next-cursor-123',
            hasMore: false
          }
        }
      });
    });

    it('should fetch timeline feed', async () => {
      const response = await request(app)
        .get('/xrpc/app.bsky.feed.getTimeline')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ limit: 50 })
        .expect(200);

      expect(response.body.feed).toBeDefined();
      expect(response.body.feed).toHaveLength(2);
      expect(response.body.feed[0].post.record.text).toBe('Test post 1');
      expect(response.body.cursor).toBe('next-cursor-123');
    });

    it('should fetch author feed', async () => {
      const response = await request(app)
        .get('/xrpc/app.bsky.feed.getAuthorFeed')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ actor: testAccount.did, limit: 50 })
        .expect(200);

      expect(response.body.feed).toBeDefined();
      expect(response.body.feed).toHaveLength(2);
    });

    it('should cache feed results', async () => {
      // First request - cache miss
      await request(app)
        .get('/xrpc/app.bsky.feed.getTimeline')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ limit: 50 })
        .expect(200);

      // Verify cached
      const cached = await cacheService.getCachedFeed(testAccount.exprsnUserId);
      expect(cached).toBeDefined();
      expect(cached.posts).toHaveLength(2);
    });
  });

  describe('Social Graph Integration', () => {
    let followerAccount;

    beforeEach(async () => {
      // Create main account
      const mainAccountData = await didService.createAccount({
        username: 'mainuser',
        email: 'main@example.com',
        exprsnUserId: 'exprsn-main-user',
        displayName: 'Main User'
      });
      testAccount = mainAccountData.account;

      // Create follower account
      const followerData = await didService.createAccount({
        username: 'follower',
        email: 'follower@example.com',
        exprsnUserId: 'exprsn-follower-user',
        displayName: 'Follower User'
      });
      followerAccount = followerData.account;

      // Create session
      const session = await sessionService.createSession(
        testAccount.did,
        testAccount.exprsnUserId
      );
      accessToken = session.accessJwt;

      // Mock timeline service for social graph
      axios.get.mockResolvedValue({
        data: {
          success: true,
          data: {
            follows: [
              {
                followerId: testAccount.exprsnUserId,
                followingId: followerAccount.exprsnUserId,
                createdAt: new Date().toISOString(),
                following: {
                  id: followerAccount.exprsnUserId,
                  username: 'follower',
                  displayName: 'Follower User'
                }
              }
            ],
            total: 1
          }
        }
      });
    });

    it('should fetch follows', async () => {
      const response = await request(app)
        .get('/xrpc/app.bsky.graph.getFollows')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ actor: testAccount.did, limit: 50 })
        .expect(200);

      expect(response.body.follows).toBeDefined();
      expect(response.body.follows).toHaveLength(1);
      expect(response.body.follows[0].did).toBe(followerAccount.did);
      expect(response.body.follows[0].handle).toBe(followerAccount.handle);
    });

    it('should fetch followers', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            followers: [
              {
                followerId: followerAccount.exprsnUserId,
                followingId: testAccount.exprsnUserId,
                createdAt: new Date().toISOString(),
                follower: {
                  id: followerAccount.exprsnUserId,
                  username: 'follower',
                  displayName: 'Follower User'
                }
              }
            ],
            total: 1
          }
        }
      });

      const response = await request(app)
        .get('/xrpc/app.bsky.graph.getFollowers')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ actor: testAccount.did, limit: 50 })
        .expect(200);

      expect(response.body.followers).toBeDefined();
      expect(response.body.followers).toHaveLength(1);
    });
  });

  describe('Actor Profile Integration', () => {
    beforeEach(async () => {
      const accountData = await didService.createAccount({
        username: 'profileuser',
        email: 'profile@example.com',
        exprsnUserId: 'exprsn-profile-user',
        displayName: 'Profile User',
        description: 'Test profile description'
      });
      testAccount = accountData.account;

      const session = await sessionService.createSession(
        testAccount.did,
        testAccount.exprsnUserId
      );
      accessToken = session.accessJwt;
    });

    it('should get profile by DID', async () => {
      const response = await request(app)
        .get('/xrpc/app.bsky.actor.getProfile')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ actor: testAccount.did })
        .expect(200);

      expect(response.body.did).toBe(testAccount.did);
      expect(response.body.handle).toBe(testAccount.handle);
      expect(response.body.displayName).toBe('Profile User');
      expect(response.body.description).toBe('Test profile description');
    });

    it('should get profile by handle', async () => {
      const response = await request(app)
        .get('/xrpc/app.bsky.actor.getProfile')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ actor: testAccount.handle })
        .expect(200);

      expect(response.body.did).toBe(testAccount.did);
      expect(response.body.handle).toBe(testAccount.handle);
    });

    it('should cache profile data', async () => {
      // First request
      await request(app)
        .get('/xrpc/app.bsky.actor.getProfile')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ actor: testAccount.did })
        .expect(200);

      // Verify cached
      const cached = await cacheService.getCachedProfile(testAccount.did);
      expect(cached).toBeDefined();
      expect(cached.displayName).toBe('Profile User');
    });

    it('should search actors', async () => {
      // Mock timeline search
      axios.get.mockResolvedValue({
        data: {
          success: true,
          data: {
            users: [
              {
                id: testAccount.exprsnUserId,
                username: 'profileuser',
                displayName: 'Profile User'
              }
            ]
          }
        }
      });

      const response = await request(app)
        .get('/xrpc/app.bsky.actor.searchActors')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ q: 'profile', limit: 25 })
        .expect(200);

      expect(response.body.actors).toBeDefined();
      expect(response.body.actors).toHaveLength(1);
      expect(response.body.actors[0].did).toBe(testAccount.did);
    });
  });

  describe('Blob Storage Integration', () => {
    beforeEach(async () => {
      const accountData = await didService.createAccount({
        username: 'blobuser',
        email: 'blob@example.com',
        exprsnUserId: 'exprsn-blob-user',
        displayName: 'Blob User'
      });
      testAccount = accountData.account;

      const session = await sessionService.createSession(
        testAccount.did,
        testAccount.exprsnUserId
      );
      accessToken = session.accessJwt;

      // Mock FileVault service
      axios.post.mockResolvedValue({
        data: {
          success: true,
          data: {
            id: 'file-123',
            filename: 'test.jpg',
            mimeType: 'image/jpeg',
            size: 1024,
            url: 'http://localhost:3007/files/file-123'
          }
        }
      });
    });

    it('should upload blob', async () => {
      const response = await request(app)
        .post('/xrpc/com.atproto.repo.uploadBlob')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('fake image data'), {
          filename: 'test.jpg',
          contentType: 'image/jpeg'
        })
        .expect(200);

      expect(response.body.blob).toBeDefined();
      expect(response.body.blob.ref).toBeDefined();
      expect(response.body.blob.mimeType).toBe('image/jpeg');
      expect(response.body.blob.size).toBe(1024);
    });

    it('should reject oversized files', async () => {
      // Create 11MB buffer (exceeds 10MB limit)
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);

      const response = await request(app)
        .post('/xrpc/com.atproto.repo.uploadBlob')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', largeBuffer, {
          filename: 'large.jpg',
          contentType: 'image/jpeg'
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should get blob metadata', async () => {
      // Mock FileVault get
      axios.get.mockResolvedValue({
        data: {
          success: true,
          data: {
            id: 'file-123',
            filename: 'test.jpg',
            mimeType: 'image/jpeg',
            size: 1024
          }
        }
      });

      const response = await request(app)
        .get('/xrpc/com.atproto.sync.getBlob')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({
          did: testAccount.did,
          cid: 'bafyreigtest123'
        })
        .expect(200);

      expect(response.body.mimeType).toBe('image/jpeg');
      expect(response.body.size).toBe(1024);
    });
  });

  describe('Repository Operations Integration', () => {
    beforeEach(async () => {
      const accountData = await didService.createAccount({
        username: 'repouser',
        email: 'repo@example.com',
        exprsnUserId: 'exprsn-repo-user',
        displayName: 'Repo User'
      });
      testAccount = accountData.account;
      testRepository = accountData.repository;

      const session = await sessionService.createSession(
        testAccount.did,
        testAccount.exprsnUserId
      );
      accessToken = session.accessJwt;
    });

    it('should describe repository', async () => {
      const response = await request(app)
        .get('/xrpc/com.atproto.repo.describeRepo')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ repo: testAccount.did })
        .expect(200);

      expect(response.body.did).toBe(testAccount.did);
      expect(response.body.handle).toBe(testAccount.handle);
      expect(response.body.didDoc).toBeDefined();
    });

    it('should list records', async () => {
      // Create test records
      await Record.create({
        repositoryId: testRepository.id,
        did: testAccount.did,
        collection: 'app.bsky.feed.post',
        rkey: 'post-1',
        cid: 'bafyreigpost1',
        record: {
          text: 'Post 1',
          createdAt: new Date().toISOString()
        }
      });

      await Record.create({
        repositoryId: testRepository.id,
        did: testAccount.did,
        collection: 'app.bsky.feed.post',
        rkey: 'post-2',
        cid: 'bafyreigpost2',
        record: {
          text: 'Post 2',
          createdAt: new Date().toISOString()
        }
      });

      const response = await request(app)
        .get('/xrpc/com.atproto.repo.listRecords')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({
          repo: testAccount.did,
          collection: 'app.bsky.feed.post'
        })
        .expect(200);

      expect(response.body.records).toBeDefined();
      expect(response.body.records).toHaveLength(2);
      expect(response.body.records[0].value.text).toBe('Post 1');
    });

    it('should cache repository data', async () => {
      // Describe repo
      await request(app)
        .get('/xrpc/com.atproto.repo.describeRepo')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ repo: testAccount.did })
        .expect(200);

      // Verify cached
      const cached = await cacheService.getCachedRepository(testAccount.did);
      expect(cached).toBeDefined();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle invalid token', async () => {
      const response = await request(app)
        .get('/xrpc/app.bsky.feed.getTimeline')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error).toBe('InvalidToken');
    });

    it('should handle missing authorization', async () => {
      const response = await request(app)
        .get('/xrpc/app.bsky.feed.getTimeline')
        .expect(401);

      expect(response.body.error).toBe('AuthRequired');
    });

    it('should handle non-existent DID', async () => {
      const accountData = await didService.createAccount({
        username: 'erroruser',
        email: 'error@example.com',
        exprsnUserId: 'exprsn-error-user',
        displayName: 'Error User'
      });

      const session = await sessionService.createSession(
        accountData.account.did,
        accountData.account.exprsnUserId
      );

      const response = await request(app)
        .get('/xrpc/app.bsky.actor.getProfile')
        .set('Authorization', `Bearer ${session.accessJwt}`)
        .query({ actor: 'did:web:exprsn.io:nonexistent' })
        .expect(404);

      expect(response.body.error).toBe('ActorNotFound');
    });

    it('should handle service unavailability gracefully', async () => {
      const accountData = await didService.createAccount({
        username: 'serviceuser',
        email: 'service@example.com',
        exprsnUserId: 'exprsn-service-user',
        displayName: 'Service User'
      });

      const session = await sessionService.createSession(
        accountData.account.did,
        accountData.account.exprsnUserId
      );

      // Mock service failure
      axios.get.mockRejectedValueOnce(new Error('Service unavailable'));

      const response = await request(app)
        .get('/xrpc/app.bsky.feed.getTimeline')
        .set('Authorization', `Bearer ${session.accessJwt}`)
        .expect(500);

      expect(response.body.error).toBe('InternalServerError');
    });
  });

  describe('Performance and Caching Integration', () => {
    beforeEach(async () => {
      const accountData = await didService.createAccount({
        username: 'perfuser',
        email: 'perf@example.com',
        exprsnUserId: 'exprsn-perf-user',
        displayName: 'Performance User'
      });
      testAccount = accountData.account;

      const session = await sessionService.createSession(
        testAccount.did,
        testAccount.exprsnUserId
      );
      accessToken = session.accessJwt;
    });

    it('should use cache for repeated DID resolutions', async () => {
      // First resolution - cache miss
      const didDoc1 = await didService.resolveDID(testAccount.did);
      expect(didDoc1).toBeDefined();

      // Cache the DID document
      await cacheService.cacheDIDDocument(testAccount.did, didDoc1);

      // Second resolution - should hit cache
      const cached = await cacheService.getCachedDIDDocument(testAccount.did);
      expect(cached).toBeDefined();
      expect(cached.id).toBe(testAccount.did);
    });

    it('should invalidate user cache on updates', async () => {
      // Cache profile
      const profile = {
        did: testAccount.did,
        handle: testAccount.handle,
        displayName: testAccount.displayName
      };
      await cacheService.cacheProfile(testAccount.did, profile);

      // Verify cached
      let cached = await cacheService.getCachedProfile(testAccount.did);
      expect(cached).toBeDefined();

      // Invalidate
      await cacheService.invalidateUserCache(testAccount.did);

      // Verify cleared
      cached = await cacheService.getCachedProfile(testAccount.did);
      expect(cached).toBeNull();
    });

    it('should track performance metrics', async () => {
      const performanceMonitor = require('../utils/performanceMonitor');

      // Make multiple requests to generate metrics
      for (let i = 0; i < 5; i++) {
        await request(app)
          .get('/xrpc/app.bsky.actor.getProfile')
          .set('Authorization', `Bearer ${accessToken}`)
          .query({ actor: testAccount.did });
      }

      // Get performance report
      const report = performanceMonitor.getReport();

      expect(report.requests.total).toBeGreaterThan(0);
      expect(report.uptime.seconds).toBeGreaterThan(0);
      expect(report.performance).toBeDefined();
    });
  });
});
