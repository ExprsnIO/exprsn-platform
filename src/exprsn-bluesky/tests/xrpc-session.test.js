const request = require('supertest');
const { app } = require('../index');
const sessionService = require('../services/sessionService');
const authIntegration = require('../services/integrations/authIntegration');
const { Account } = require('../models');

// Mock dependencies
jest.mock('../services/sessionService');
jest.mock('../services/integrations/authIntegration');
jest.mock('../models');

describe('XRPC Session Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /xrpc/com.atproto.server.createSession', () => {
    it('should create session with valid credentials', async () => {
      authIntegration.authenticate.mockResolvedValue({
        success: true,
        userId: 'user-uuid-123'
      });

      Account.findOne.mockResolvedValue({
        did: 'did:web:exprsn.io:testuser',
        handle: 'testuser.exprsn.io'
      });

      sessionService.createSession.mockResolvedValue({
        accessJwt: 'access-token',
        refreshJwt: 'refresh-token',
        handle: 'testuser.exprsn.io',
        did: 'did:web:exprsn.io:testuser',
        email: 'test@example.com'
      });

      const response = await request(app)
        .post('/xrpc/com.atproto.server.createSession')
        .send({
          identifier: 'testuser',
          password: 'password123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessJwt');
      expect(response.body).toHaveProperty('refreshJwt');
      expect(response.body.handle).toBe('testuser.exprsn.io');
    });

    it('should reject invalid credentials', async () => {
      authIntegration.authenticate.mockResolvedValue({
        success: false
      });

      const response = await request(app)
        .post('/xrpc/com.atproto.server.createSession')
        .send({
          identifier: 'testuser',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.error).toBe('AuthenticationFailed');
    });

    it('should reject missing account', async () => {
      authIntegration.authenticate.mockResolvedValue({
        success: true,
        userId: 'user-uuid-123'
      });

      Account.findOne.mockResolvedValue(null);

      const response = await request(app)
        .post('/xrpc/com.atproto.server.createSession')
        .send({
          identifier: 'testuser',
          password: 'password123'
        })
        .expect(404);

      expect(response.body.error).toBe('AccountNotFound');
    });
  });

  describe('POST /xrpc/com.atproto.server.refreshSession', () => {
    it('should refresh session with valid token', async () => {
      sessionService.refreshSession.mockResolvedValue({
        accessJwt: 'new-access-token',
        refreshJwt: 'refresh-token',
        handle: 'testuser.exprsn.io',
        did: 'did:web:exprsn.io:testuser'
      });

      const response = await request(app)
        .post('/xrpc/com.atproto.server.refreshSession')
        .set('Authorization', 'Bearer valid-refresh-token')
        .expect(200);

      expect(response.body).toHaveProperty('accessJwt');
      expect(response.body.accessJwt).toBe('new-access-token');
    });

    it('should reject invalid refresh token', async () => {
      sessionService.refreshSession.mockRejectedValue(
        new Error('Invalid token')
      );

      const response = await request(app)
        .post('/xrpc/com.atproto.server.refreshSession')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error).toBe('ExpiredToken');
    });
  });

  describe('GET /xrpc/com.atproto.server.getSession', () => {
    it('should return session info for valid token', async () => {
      sessionService.getSessionInfo.mockResolvedValue({
        handle: 'testuser.exprsn.io',
        did: 'did:web:exprsn.io:testuser',
        email: 'test@example.com'
      });

      const response = await request(app)
        .get('/xrpc/com.atproto.server.getSession')
        .set('Authorization', 'Bearer valid-access-token')
        .expect(200);

      expect(response.body.handle).toBe('testuser.exprsn.io');
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/xrpc/com.atproto.server.getSession')
        .expect(401);

      expect(response.body.error).toBe('AuthRequired');
    });
  });

  describe('POST /xrpc/com.atproto.server.deleteSession', () => {
    it('should delete session successfully', async () => {
      sessionService.deleteSession.mockResolvedValue(true);

      const response = await request(app)
        .post('/xrpc/com.atproto.server.deleteSession')
        .set('Authorization', 'Bearer valid-access-token')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
