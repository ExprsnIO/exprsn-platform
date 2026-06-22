/**
 * Session Tests
 * Tests for session creation, management, and revocation
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser,
  getModels
} = require('./helpers/testDatabase');

describe('Sessions', () => {
  let models;
  let agent;

  beforeAll(async () => {
    const db = await setupTestDatabase();
    models = db.models;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
    agent = request.agent(app);
  });

  describe('Session Creation', () => {
    test('should create session on login', async () => {
      const user = await createTestUser({
        email: 'session@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const response = await agent
        .post('/api/auth/login')
        .send({
          email: 'session@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      expect(response.body.message).toContain('Login successful');

      // Verify session was created in database
      const session = await models.Session.findOne({
        where: { userId: user.id }
      });

      expect(session).toBeTruthy();
      expect(session.active).toBe(true);
    });

    test('should store user data in session', async () => {
      const user = await createTestUser({
        email: 'data@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        displayName: 'Test User'
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'data@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      const session = await models.Session.findOne({
        where: { userId: user.id }
      });

      expect(session).toBeTruthy();
      expect(session.userId).toBe(user.id);
    });

    test('should set session expiration', async () => {
      const user = await createTestUser({
        email: 'expire@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'expire@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      const session = await models.Session.findOne({
        where: { userId: user.id }
      });

      expect(session.expiresAt).toBeTruthy();
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    test('should store IP address and user agent', async () => {
      const user = await createTestUser({
        email: 'tracking@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .set('User-Agent', 'Mozilla/5.0 Test Browser')
        .send({
          email: 'tracking@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      const session = await models.Session.findOne({
        where: { userId: user.id }
      });

      expect(session.ipAddress).toBeTruthy();
      expect(session.userAgent).toBeTruthy();
    });
  });

  describe('Session Management', () => {
    test('should get active sessions for user', async () => {
      const user = await createTestUser({
        email: 'active@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      // Create multiple sessions
      await models.Session.create({
        sessionId: 'session-1',
        userId: user.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Browser 1',
        active: true,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      await models.Session.create({
        sessionId: 'session-2',
        userId: user.id,
        ipAddress: '127.0.0.2',
        userAgent: 'Browser 2',
        active: true,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'active@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .get('/api/sessions')
        .expect(200);

      expect(response.body.sessions).toHaveLength(3); // 2 created + 1 from login
      expect(response.body.sessions[0]).toHaveProperty('id');
      expect(response.body.sessions[0]).toHaveProperty('sessionId');
      expect(response.body.sessions[0]).toHaveProperty('ipAddress');
      expect(response.body.sessions[0]).toHaveProperty('userAgent');
      expect(response.body.sessions[0]).toHaveProperty('lastActivityAt');
    });

    test('should mark current session in list', async () => {
      const user = await createTestUser({
        email: 'current@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'current@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .get('/api/sessions')
        .expect(200);

      const currentSession = response.body.sessions.find(s => s.isCurrent);
      expect(currentSession).toBeTruthy();
    });

    test('should get current session details', async () => {
      const user = await createTestUser({
        email: 'details@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'details@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .get('/api/sessions/current')
        .expect(200);

      expect(response.body.session).toBeTruthy();
      expect(response.body.session.isCurrent).toBe(true);
      expect(response.body.session).toHaveProperty('sessionId');
      expect(response.body.session).toHaveProperty('expiresAt');
    });

    test('should filter out expired sessions', async () => {
      const user = await createTestUser({
        email: 'expired@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      // Create active session
      await models.Session.create({
        sessionId: 'active-session',
        userId: user.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Browser',
        active: true,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      // Create expired session
      await models.Session.create({
        sessionId: 'expired-session',
        userId: user.id,
        ipAddress: '127.0.0.2',
        userAgent: 'Browser',
        active: true,
        expiresAt: new Date(Date.now() - 1000), // Expired
        lastActivityAt: new Date()
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'expired@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .get('/api/sessions')
        .expect(200);

      // Should only include non-expired sessions
      expect(response.body.sessions.every(s =>
        new Date(s.expiresAt).getTime() > Date.now()
      )).toBe(true);
    });

    test('should filter out inactive sessions', async () => {
      const user = await createTestUser({
        email: 'inactive@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      // Create inactive session
      await models.Session.create({
        sessionId: 'inactive-session',
        userId: user.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Browser',
        active: false,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'inactive@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .get('/api/sessions')
        .expect(200);

      // Should only include active sessions
      expect(response.body.sessions.every(s =>
        s.ipAddress !== '127.0.0.1' // Inactive session
      )).toBe(true);
    });
  });

  describe('Session Revocation', () => {
    test('should revoke specific session', async () => {
      const user = await createTestUser({
        email: 'revoke@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const sessionToRevoke = await models.Session.create({
        sessionId: 'revoke-this',
        userId: user.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Browser',
        active: true,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'revoke@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .delete(`/api/sessions/${sessionToRevoke.id}`)
        .expect(200);

      expect(response.body.message).toContain('revoked');

      // Verify session is inactive
      await sessionToRevoke.reload();
      expect(sessionToRevoke.active).toBe(false);
    });

    test('should prevent revoking current session', async () => {
      const user = await createTestUser({
        email: 'current@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'current@example.com',
          password: 'Test123!@#'
        });

      // Get current session
      const currentResponse = await agent
        .get('/api/sessions/current')
        .expect(200);

      const currentSessionId = currentResponse.body.session.id;

      // Try to revoke current session
      const response = await agent
        .delete(`/api/sessions/${currentSessionId}`)
        .expect(400);

      expect(response.body.error).toBe('CANNOT_REVOKE_CURRENT_SESSION');
    });

    test('should revoke all sessions except current', async () => {
      const user = await createTestUser({
        email: 'all@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      // Create multiple sessions
      const session1 = await models.Session.create({
        sessionId: 'session-1',
        userId: user.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Browser 1',
        active: true,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      const session2 = await models.Session.create({
        sessionId: 'session-2',
        userId: user.id,
        ipAddress: '127.0.0.2',
        userAgent: 'Browser 2',
        active: true,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      // Login to create current session
      await agent
        .post('/api/auth/login')
        .send({
          email: 'all@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .delete('/api/sessions')
        .expect(200);

      expect(response.body.message).toContain('revoked');
      expect(response.body.revokedCount).toBe(2);

      // Verify other sessions are inactive
      await session1.reload();
      await session2.reload();
      expect(session1.active).toBe(false);
      expect(session2.active).toBe(false);

      // Verify current session still active
      const currentSession = await models.Session.findOne({
        where: { userId: user.id, active: true }
      });
      expect(currentSession).toBeTruthy();
    });

    test('should only revoke own sessions', async () => {
      const user1 = await createTestUser({
        email: 'user1@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const user2 = await createTestUser({
        email: 'user2@example.com'
      });

      const user2Session = await models.Session.create({
        sessionId: 'user2-session',
        userId: user2.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Browser',
        active: true,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'user1@example.com',
          password: 'Test123!@#'
        });

      // Try to revoke another user's session
      const response = await agent
        .delete(`/api/sessions/${user2Session.id}`)
        .expect(404);

      expect(response.body.error).toBe('SESSION_NOT_FOUND');

      // Verify session is still active
      await user2Session.reload();
      expect(user2Session.active).toBe(true);
    });
  });

  describe('Session Timeout', () => {
    test('should handle session timeout', async () => {
      const user = await createTestUser({
        email: 'timeout@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      // Create expired session
      const expiredSession = await models.Session.create({
        sessionId: 'expired-session',
        userId: user.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Browser',
        active: true,
        expiresAt: new Date(Date.now() - 1000), // Expired
        lastActivityAt: new Date(Date.now() - 1000)
      });

      // Sessions should automatically be filtered by expiry
      const activeSessions = await models.Session.findAll({
        where: {
          userId: user.id,
          active: true,
          expiresAt: {
            [require('sequelize').Op.gt]: new Date()
          }
        }
      });

      expect(activeSessions).toHaveLength(0);
    });

    test('should refresh session expiry on activity', async () => {
      const user = await createTestUser({
        email: 'refresh@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'refresh@example.com',
          password: 'Test123!@#'
        });

      const session = await models.Session.findOne({
        where: { userId: user.id }
      });

      const originalExpiry = session.expiresAt;

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));

      // Make a request to refresh session
      const response = await agent
        .post('/api/sessions/refresh')
        .expect(200);

      expect(response.body.message).toContain('refreshed');

      // Verify expiry was extended
      await session.reload();
      expect(session.expiresAt.getTime()).toBeGreaterThan(originalExpiry.getTime());
    });

    test('should update last activity timestamp', async () => {
      const user = await createTestUser({
        email: 'activity@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'activity@example.com',
          password: 'Test123!@#'
        });

      const session = await models.Session.findOne({
        where: { userId: user.id }
      });

      const originalActivity = session.lastActivityAt;

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));

      // Refresh session
      await agent
        .post('/api/sessions/refresh')
        .expect(200);

      // Verify last activity was updated
      await session.reload();
      expect(session.lastActivityAt.getTime()).toBeGreaterThan(originalActivity.getTime());
    });
  });

  describe('Session Security', () => {
    test('should require authentication to view sessions', async () => {
      const response = await request(app)
        .get('/api/sessions')
        .expect(401);

      expect(response.body.error).toBe('NOT_AUTHENTICATED');
    });

    test('should require authentication to revoke sessions', async () => {
      const response = await request(app)
        .delete('/api/sessions/some-session-id')
        .expect(401);

      expect(response.body.error).toBe('NOT_AUTHENTICATED');
    });

    test('should destroy session on logout', async () => {
      const user = await createTestUser({
        email: 'logout@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'logout@example.com',
          password: 'Test123!@#'
        });

      const session = await models.Session.findOne({
        where: { userId: user.id, active: true }
      });

      expect(session).toBeTruthy();

      // Logout
      await agent
        .post('/api/auth/logout')
        .expect(200);

      // Verify session is destroyed or inactive
      await session.reload();
      expect(session.active).toBe(false);
    });

    test('should store session data securely', async () => {
      const user = await createTestUser({
        email: 'secure@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'secure@example.com',
          password: 'Test123!@#'
        });

      const session = await models.Session.findOne({
        where: { userId: user.id }
      });

      // Session should not contain sensitive data directly
      expect(session).not.toHaveProperty('password');
      expect(session).not.toHaveProperty('passwordHash');
    });
  });

  describe('Multiple Sessions', () => {
    test('should allow multiple active sessions per user', async () => {
      const user = await createTestUser({
        email: 'multi@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      // Create first session
      const agent1 = request.agent(app);
      await agent1
        .post('/api/auth/login')
        .send({
          email: 'multi@example.com',
          password: 'Test123!@#'
        });

      // Create second session
      const agent2 = request.agent(app);
      await agent2
        .post('/api/auth/login')
        .send({
          email: 'multi@example.com',
          password: 'Test123!@#'
        });

      // Verify both sessions exist
      const sessions = await models.Session.findAll({
        where: { userId: user.id, active: true }
      });

      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    test('should track sessions independently', async () => {
      const user = await createTestUser({
        email: 'independent@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const agent1 = request.agent(app);
      await agent1
        .post('/api/auth/login')
        .send({
          email: 'independent@example.com',
          password: 'Test123!@#'
        });

      const agent2 = request.agent(app);
      await agent2
        .post('/api/auth/login')
        .send({
          email: 'independent@example.com',
          password: 'Test123!@#'
        });

      // Get sessions from each agent
      const response1 = await agent1
        .get('/api/sessions')
        .expect(200);

      const response2 = await agent2
        .get('/api/sessions')
        .expect(200);

      // Each should see the same total number of sessions
      expect(response1.body.sessions.length).toBe(response2.body.sessions.length);

      // But each should mark a different session as current
      const current1 = response1.body.sessions.find(s => s.isCurrent);
      const current2 = response2.body.sessions.find(s => s.isCurrent);

      expect(current1.sessionId).not.toBe(current2.sessionId);
    });
  });

  describe('SP-6: CA token persistence + revocation', () => {
    async function login(email, password = 'Test123!@#') {
      const a = request.agent(app);
      const res = await a.post('/api/auth/login').send({ email, password }).expect(200);
      return { agent: a, token: res.body.token };
    }

    test('login persists a session row carrying the CA token id', async () => {
      const user = await createTestUser({
        email: 'catoken@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const { token } = await login('catoken@example.com');
      expect(token).toBeTruthy();

      const session = await models.Session.findOne({ where: { userId: user.id } });
      expect(session).toBeTruthy();
      expect(session.caTokenId).toBe(token);
    });

    test('register persists an active session row', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'reg@example.com', password: 'Zx9$Kp2mLq7@', displayName: 'Reg' })
        .expect(201);

      expect(res.body.token).toBeTruthy();
      const session = await models.Session.findOne({ where: { caTokenId: res.body.token } });
      expect(session).toBeTruthy();
      expect(session.active).toBe(true);
    });

    test('bearer-only GET /sessions lists the session and marks it current', async () => {
      await createTestUser({
        email: 'bearer@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const { token } = await login('bearer@example.com');

      // Fresh client, no cookie — bearer only.
      const res = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);
      const current = res.body.sessions.find(s => s.isCurrent);
      expect(current).toBeTruthy();
    });

    test('revoking a session invalidates its CA token (subsequent calls 401)', async () => {
      await createTestUser({
        email: 'revoke401@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      // Session 1 = cookie agent (the "current" session doing the revoking).
      const { agent: a1 } = await login('revoke401@example.com');
      // Session 2 = a second login; we hold only its bearer token.
      const { token: token2 } = await login('revoke401@example.com');

      const s2 = await models.Session.findOne({ where: { caTokenId: token2 } });
      expect(s2).toBeTruthy();

      // token2 is accepted before revocation.
      await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      // Agent 1 revokes session 2.
      await a1.delete(`/api/sessions/${s2.id}`).expect(200);

      // token2 is now rejected — the CA token was revoked, not just the row.
      const res = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${token2}`)
        .expect(401);
      expect(res.body.error).toBe('NOT_AUTHENTICATED');

      await s2.reload();
      expect(s2.active).toBe(false);
    });

    test('re-mint (POST /api/auth/token) updates caTokenId in place, no duplicate row', async () => {
      const user = await createTestUser({
        email: 'remint@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const { agent: a } = await login('remint@example.com');
      const before = await models.Session.count({ where: { userId: user.id } });

      const res = await a.post('/api/auth/token').expect(200);
      expect(res.body.token).toBeTruthy();

      const after = await models.Session.count({ where: { userId: user.id } });
      expect(after).toBe(before); // upsert by sessionId, not a new insert

      const session = await models.Session.findOne({ where: { userId: user.id } });
      expect(session.caTokenId).toBe(res.body.token);
    });

    test('bearer cannot revoke its own current session', async () => {
      await createTestUser({
        email: 'self@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const { token } = await login('self@example.com');
      const own = await models.Session.findOne({ where: { caTokenId: token } });

      const res = await request(app)
        .delete(`/api/sessions/${own.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      expect(res.body.error).toBe('CANNOT_REVOKE_CURRENT_SESSION');
    });

    test('logout revokes the current session token', async () => {
      await createTestUser({
        email: 'logout401@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const { agent: a, token } = await login('logout401@example.com');
      await a.post('/api/auth/logout').expect(200);

      // The bearer minted for that session no longer validates.
      await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });
});
