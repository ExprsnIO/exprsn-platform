const {
  authenticate,
  requireAdmin,
  requireDBPermissions,
  auditLogger,
  validateConnectionOwnership
} = require('../../src/middleware/auth');
const { Connection, AuditLog } = require('../../src/models');

describe('Authentication Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: null,
      headers: {},
      body: {},
      query: {},
      params: {},
      method: 'GET',
      path: '/test',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent')
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn()
    };

    next = jest.fn();

    process.env.NODE_ENV = 'test';
    process.env.SKIP_AUTH = 'true';
  });

  describe('authenticate', () => {
    it('should bypass auth in development with SKIP_AUTH', () => {
      authenticate(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBeDefined();
      expect(next).toHaveBeenCalled();
    });

    it('should set test user in development mode', () => {
      authenticate(req, res, next);

      expect(req.user.role).toBe('admin');
    });
  });

  describe('requireAdmin', () => {
    it('should allow admin users', () => {
      req.user = { id: 'user-123', role: 'admin' };

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow dba users', () => {
      req.user = { id: 'user-123', role: 'dba' };

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject non-admin users', () => {
      process.env.SKIP_AUTH = 'false';
      req.user = { id: 'user-123', role: 'user' };

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'FORBIDDEN'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated users', () => {
      process.env.SKIP_AUTH = 'false';
      req.user = null;

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('auditLogger', () => {
    it('should log audit entry on successful request', async () => {
      const middleware = auditLogger('TEST_ACTION', 'test_resource');
      req.user = { id: 'user-123' };

      // Mock AuditLog.create
      const createSpy = jest.spyOn(AuditLog, 'create').mockResolvedValue({});

      middleware(req, res, next);

      // Call the overridden send
      res.send({ success: true });

      // Wait for async audit log
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(createSpy).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();

      createSpy.mockRestore();
    });

    it('should sanitize sensitive data in audit logs', async () => {
      const middleware = auditLogger('CREATE_CONNECTION', 'connection');
      req.user = { id: 'user-123' };
      req.body = {
        name: 'Test',
        password: 'secret123',
        token: 'abc-token'
      };

      const createSpy = jest.spyOn(AuditLog, 'create').mockResolvedValue({});

      middleware(req, res, next);
      res.send({ success: true });

      await new Promise(resolve => setTimeout(resolve, 100));

      const auditCall = createSpy.mock.calls[0][0];
      expect(auditCall.details.body.password).toBe('***REDACTED***');
      expect(auditCall.details.body.token).toBe('***REDACTED***');

      createSpy.mockRestore();
    });
  });

  describe('validateConnectionOwnership', () => {
    it('should allow access to own connection', async () => {
      const mockConnection = {
        id: 'conn-123',
        userId: 'user-123',
        name: 'My Connection'
      };

      jest.spyOn(Connection, 'findByPk').mockResolvedValue(mockConnection);

      req.user = { id: 'user-123', role: 'user' };
      req.params.id = 'conn-123';

      await validateConnectionOwnership(req, res, next);

      expect(req.connection).toEqual(mockConnection);
      expect(next).toHaveBeenCalled();
    });

    it('should allow admin access to any connection', async () => {
      const mockConnection = {
        id: 'conn-123',
        userId: 'other-user',
        name: 'Other Connection'
      };

      jest.spyOn(Connection, 'findByPk').mockResolvedValue(mockConnection);

      req.user = { id: 'admin-123', role: 'admin' };
      req.params.id = 'conn-123';

      await validateConnectionOwnership(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should deny access to other users connections', async () => {
      process.env.SKIP_AUTH = 'false';

      const mockConnection = {
        id: 'conn-123',
        userId: 'other-user',
        name: 'Other Connection'
      };

      jest.spyOn(Connection, 'findByPk').mockResolvedValue(mockConnection);

      req.user = { id: 'user-123', role: 'user' };
      req.params.id = 'conn-123';

      await validateConnectionOwnership(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 404 for non-existent connection', async () => {
      process.env.SKIP_AUTH = 'false';

      jest.spyOn(Connection, 'findByPk').mockResolvedValue(null);

      req.user = { id: 'user-123', role: 'user' };
      req.params.id = 'nonexistent';

      await validateConnectionOwnership(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
