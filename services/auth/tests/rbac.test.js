/**
 * RBAC Tests
 * Tests for Role-Based Access Control (rbacService) — permission resolution
 * from user and group roles, wildcard/pattern matching, scoped assignments,
 * service access, and role assignment/revocation.
 *
 * NOTE on middleware: most of src/middleware/rbac.js (requirePermission,
 * requireRole, requireOrganizationMember, ...) depends on a `getRbacService`
 * factory + methods (hasAnyPermission, isOrganizationMember, getUserRoles, …)
 * that src/services/rbacService.js does not export — it is currently unused
 * dead code and cannot work at runtime. Only the pieces that do not touch the
 * service (requireOwnership, anyOf, allOf) are tested here.
 */

const { v4: uuidv4 } = require('uuid');
const rbacService = require('../src/services/rbacService');
const {
  requireOwnership,
  anyOf,
  allOf
} = require('../src/middleware/rbac');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser,
  createTestRole,
  createTestOrganization,
  getModels
} = require('./helpers/testDatabase');
const { AppError } = require('@exprsn/shared');

/** Create a minimal Application row (UserRole.applicationId is a real FK). */
async function createTestApplication(org) {
  return getModels().Application.create({
    clientId: `app-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    clientSecret: 'test-app-secret',
    name: `Test App ${Date.now()}`,
    organizationId: org.id
  });
}

/** Create a Group (name + slug are NOT NULL). */
async function createTestGroup(name) {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.floor(Math.random() * 1e6)}`;
  return getModels().Group.create({ name, slug, description: `${name} group` });
}

describe('RBAC Service', () => {
  let models;

  beforeAll(async () => {
    const db = await setupTestDatabase();
    models = db.models;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  describe('Permission Checking', () => {
    test('should check if user has permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'editor',
        permissions: ['content:read', 'content:write']
      });

      await user.addRole(role);

      const result = await rbacService.checkPermission(user.id, 'content:read');
      expect(result.allowed).toBe(true);
      expect(result.role).toBe('editor'); // role slug
    });

    test('should deny permission if user does not have it', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'viewer',
        permissions: ['content:read']
      });

      await user.addRole(role);

      const result = await rbacService.checkPermission(user.id, 'content:delete');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No matching permission');
    });

    test('should support wildcard permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'admin',
        permissions: ['*']
      });

      await user.addRole(role);

      const result = await rbacService.checkPermission(user.id, 'any:permission:here');
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Wildcard');
    });

    test('should support pattern matching permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'content-manager',
        permissions: ['content:*']
      });

      await user.addRole(role);

      const readResult = await rbacService.checkPermission(user.id, 'content:read');
      expect(readResult.allowed).toBe(true);

      const writeResult = await rbacService.checkPermission(user.id, 'content:write');
      expect(writeResult.allowed).toBe(true);

      const otherResult = await rbacService.checkPermission(user.id, 'other:read');
      expect(otherResult.allowed).toBe(false);
    });

    test('should check organization-scoped permissions', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      const role = await createTestRole({
        name: 'org-admin-test',
        permissions: ['org:admin']
      });

      await models.UserRole.create({
        userId: user.id,
        roleId: role.id,
        scope: 'organization',
        organizationId: org.id,
        status: 'active'
      });

      const result = await rbacService.checkPermission(
        user.id,
        'org:admin',
        { organizationId: org.id }
      );

      expect(result.allowed).toBe(true);
    });

    test('should check application-scoped permissions', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      const app = await createTestApplication(org);
      const role = await createTestRole({
        name: 'app-user',
        permissions: ['app:use']
      });

      await models.UserRole.create({
        userId: user.id,
        roleId: role.id,
        scope: 'application',
        organizationId: org.id,
        applicationId: app.id,
        status: 'active'
      });

      const result = await rbacService.checkPermission(
        user.id,
        'app:use',
        { organizationId: org.id, applicationId: app.id }
      );

      expect(result.allowed).toBe(true);
    });

    test('should inherit permissions from group roles', async () => {
      const user = await createTestUser();
      const group = await createTestGroup('Editors');
      const role = await createTestRole({
        name: 'editor',
        permissions: ['content:edit']
      });

      await user.addGroup(group);
      await group.addRole(role);

      const result = await rbacService.checkPermission(user.id, 'content:edit');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Role Checking', () => {
    test('should check if user has role', async () => {
      const user = await createTestUser();
      const role = await createTestRole({ name: 'admin' });

      await user.addRole(role);

      const roles = await rbacService.getUserPermissions(user.id);
      expect(roles.roles).toContainEqual(
        expect.objectContaining({ slug: 'admin', source: 'user' })
      );
    });

    test('should check organization-scoped roles', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      const role = await createTestRole({ name: 'org-manager' });

      await models.UserRole.create({
        userId: user.id,
        roleId: role.id,
        scope: 'organization',
        organizationId: org.id,
        status: 'active'
      });

      const permissions = await rbacService.getUserPermissions(
        user.id,
        { organizationId: org.id }
      );

      expect(permissions.roles).toContainEqual(
        expect.objectContaining({ slug: 'org-manager' })
      );
    });

    test('should check application-scoped roles', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      const app = await createTestApplication(org);
      const role = await createTestRole({ name: 'app-admin' });

      await models.UserRole.create({
        userId: user.id,
        roleId: role.id,
        scope: 'application',
        organizationId: org.id,
        applicationId: app.id,
        status: 'active'
      });

      const permissions = await rbacService.getUserPermissions(
        user.id,
        { organizationId: org.id, applicationId: app.id }
      );

      expect(permissions.roles).toContainEqual(
        expect.objectContaining({ slug: 'app-admin' })
      );
    });
  });

  describe('Service Access', () => {
    test('should check service access permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'service-user',
        permissions: ['service:timeline:access'],
        serviceAccess: {
          allowedServices: ['timeline'],
          deniedServices: []
        }
      });

      await user.addRole(role);

      const result = await rbacService.checkServiceAccess(user.id, 'timeline');
      expect(result.allowed).toBe(true);
    });

    test('should deny access to services not in allowed list', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'limited-user',
        permissions: [],
        serviceAccess: {
          allowedServices: ['timeline'],
          deniedServices: []
        }
      });

      await user.addRole(role);

      const result = await rbacService.checkServiceAccess(user.id, 'nexus');
      expect(result.allowed).toBe(false);
    });

    test('should deny access to explicitly denied services', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'restricted-user',
        permissions: ['*'],
        serviceAccess: {
          allowedServices: [],
          deniedServices: ['admin']
        }
      });

      await user.addRole(role);

      const result = await rbacService.checkServiceAccess(user.id, 'admin');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('denied');
    });
  });

  describe('Role Assignment', () => {
    test('should assign role to user', async () => {
      const user = await createTestUser();
      const role = await createTestRole({ name: 'moderator' });

      const assignment = await rbacService.assignRoleToUser(user.id, role.id);

      expect(assignment).toBeTruthy();
      expect(assignment.userId).toBe(user.id);
      expect(assignment.roleId).toBe(role.id);
      expect(assignment.status).toBe('active');
      expect(assignment.scope).toBe('global');
    });

    test('should assign role with organization scope', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      const role = await createTestRole({ name: 'org-member-test' });

      const assignment = await rbacService.assignRoleToUser(
        user.id,
        role.id,
        { organizationId: org.id }
      );

      expect(assignment.scope).toBe('organization');
      expect(assignment.organizationId).toBe(org.id);
    });

    test('should assign role with expiration', async () => {
      const user = await createTestUser();
      const role = await createTestRole({ name: 'temp-role' });
      const expiresAt = new Date(Date.now() + 86400000); // 24 hours

      const assignment = await rbacService.assignRoleToUser(
        user.id,
        role.id,
        { expiresAt }
      );

      expect(assignment.expiresAt).toBeTruthy();
    });

    test('should reject assigning an already-active role', async () => {
      const user = await createTestUser();
      const role = await createTestRole({ name: 'dupe-role' });

      await rbacService.assignRoleToUser(user.id, role.id);

      await expect(rbacService.assignRoleToUser(user.id, role.id))
        .rejects.toMatchObject({ errorCode: 'ROLE_ALREADY_ASSIGNED' });
    });

    test('should revoke role from user (and allow reactivation)', async () => {
      const user = await createTestUser();
      const role = await createTestRole({ name: 'editor' });

      await rbacService.assignRoleToUser(user.id, role.id);
      const revoked = await rbacService.revokeRoleFromUser(user.id, role.id);

      expect(revoked.status).toBe('revoked');

      // Re-assigning reactivates the same row
      const reassigned = await rbacService.assignRoleToUser(user.id, role.id);
      expect(reassigned.status).toBe('active');
      expect(reassigned.id).toBe(revoked.id);
    });

    test('should assign role to group', async () => {
      const group = await createTestGroup('Assign Group');
      const role = await createTestRole({ name: 'group-role' });

      const assignment = await rbacService.assignRoleToGroup(group.id, role.id);

      expect(assignment).toBeTruthy();
      expect(assignment.groupId).toBe(group.id);
      expect(assignment.roleId).toBe(role.id);
    });

    test('should revoke role from group', async () => {
      const group = await createTestGroup('Revoke Group');
      const role = await createTestRole({ name: 'group-role' });

      await rbacService.assignRoleToGroup(group.id, role.id);
      const revoked = await rbacService.revokeRoleFromGroup(group.id, role.id);

      expect(revoked.status).toBe('revoked');
    });
  });

  describe('Get User Permissions', () => {
    test('should get all permissions for user', async () => {
      const user = await createTestUser();
      const role1 = await createTestRole({
        name: 'role1',
        permissions: ['perm1', 'perm2']
      });
      const role2 = await createTestRole({
        name: 'role2',
        permissions: ['perm2', 'perm3']
      });

      await user.addRole(role1);
      await user.addRole(role2);

      const result = await rbacService.getUserPermissions(user.id);

      expect(result.permissions).toContain('perm1');
      expect(result.permissions).toContain('perm2');
      expect(result.permissions).toContain('perm3');
      expect(result.permissions.filter(p => p === 'perm2')).toHaveLength(1); // de-duplicated
      expect(result.roles).toHaveLength(2);
    });

    test('should include permissions from group roles', async () => {
      const user = await createTestUser();
      const group = await createTestGroup('Admins');
      const role = await createTestRole({
        name: 'group-admin',
        permissions: ['admin:access']
      });

      await user.addGroup(group);
      await group.addRole(role);

      const result = await rbacService.getUserPermissions(user.id);

      expect(result.permissions).toContain('admin:access');
      expect(result.roles.some(r => r.source.includes('group'))).toBe(true);
    });

    test('should throw USER_NOT_FOUND for an unknown user', async () => {
      await expect(rbacService.getUserPermissions(uuidv4()))
        .rejects.toMatchObject({ errorCode: 'USER_NOT_FOUND' });
    });
  });
});

describe('RBAC Middleware (service-independent pieces)', () => {
  // These middleware pieces never touch the DB — plain unit tests. (The shared
  // sequelize handle is closed by the service describe's afterAll, so this
  // block must not re-open it.)
  const passMiddleware = (req, res, next) => next();
  const failMiddleware = (req, res, next) =>
    next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));

  // requireOwnership is wrapped in the shared asyncHandler, which does NOT
  // return the inner promise — flush the microtask/immediate queue so the
  // .catch(next) path has landed before asserting.
  const flush = () => new Promise(resolve => setImmediate(resolve));

  describe('requireOwnership', () => {
    test('should allow access if user owns resource', async () => {
      const req = {
        user: { id: 'user-1' },
        params: { resourceId: 'test-resource' }
      };
      const res = {};
      const next = jest.fn();

      const getOwner = async (r) => r.user.id;
      const middleware = requireOwnership(getOwner);
      await middleware(req, res, next);
      await flush();

      expect(next).toHaveBeenCalledWith();
    });

    test('should deny access if user does not own resource', async () => {
      const req = {
        user: { id: 'user-1' },
        params: { resourceId: 'test-resource' }
      };
      const res = {};
      const next = jest.fn();

      const getOwner = async () => 'other-user-id';
      const middleware = requireOwnership(getOwner);
      await middleware(req, res, next);
      await flush();

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.errorCode).toBe('FORBIDDEN');
      expect(error.statusCode).toBe(403);
    });

    test('should 404 when the resource has no owner', async () => {
      const req = { user: { id: 'user-1' }, params: {} };
      const next = jest.fn();

      const middleware = requireOwnership(async () => null);
      await middleware(req, {}, next);
      await flush();

      const error = next.mock.calls[0][0];
      expect(error.errorCode).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });

    test('should require authentication', async () => {
      const req = { params: {} };
      const next = jest.fn();

      const middleware = requireOwnership(async () => 'someone');
      await middleware(req, {}, next);
      await flush();

      const error = next.mock.calls[0][0];
      expect(error.errorCode).toBe('NOT_AUTHENTICATED');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('anyOf', () => {
    test('should allow if any middleware passes', async () => {
      const req = {};
      const next = jest.fn();

      const middleware = anyOf(failMiddleware, passMiddleware);
      await middleware(req, {}, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('should deny with the last error if all middlewares fail', async () => {
      const req = {};
      const next = jest.fn();

      const middleware = anyOf(failMiddleware, failMiddleware);
      await middleware(req, {}, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].errorCode).toBe('FORBIDDEN');
    });
  });

  describe('allOf', () => {
    test('should allow if all middlewares pass', async () => {
      const req = {};
      const next = jest.fn();

      const middleware = allOf(passMiddleware, passMiddleware);
      await middleware(req, {}, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('should deny if any middleware fails', async () => {
      const req = {};
      const next = jest.fn();

      const middleware = allOf(passMiddleware, failMiddleware);
      await middleware(req, {}, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });
});
