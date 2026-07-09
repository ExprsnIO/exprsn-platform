/**
 * ═══════════════════════════════════════════════════════════
 * SAML SSO Tests
 *
 * The SAML implementation is CONFIG-driven (src/config/saml.js: env-configured
 * IdPs, passport-saml strategies) — there is no SAMLProvider DB model. In the
 * test environment SAML is disabled (SAML_ENABLED !== 'true'), so the HTTP
 * surface must fail closed with 503 SAML_DISABLED, and /status reports
 * enabled:false. Service-level behavior (attribute mapping, JIT provisioning)
 * is tested directly against SamlService.
 * ═══════════════════════════════════════════════════════════
 */

const request = require('supertest');
const app = require('../src/app');
const samlConfig = require('../src/config/saml');
const { SamlService } = require('../src/services/samlService');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser,
  getModels
} = require('./helpers/testDatabase');

describe('SAML SSO', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  describe('Disabled configuration (test environment)', () => {
    test('config reports SAML disabled', () => {
      expect(samlConfig.enabled).toBe(false);
    });

    test('validateConfig is valid (trivially) when disabled', () => {
      const result = samlConfig.validateConfig();
      expect(result.valid).toBe(true);
    });

    test('GET /api/saml/metadata fails closed with 503 SAML_DISABLED', async () => {
      const response = await request(app)
        .get('/api/saml/metadata')
        .expect(503);
      expect(response.body.error).toBe('SAML_DISABLED');
    });

    test('GET /api/saml/login fails closed with 503 SAML_DISABLED', async () => {
      const response = await request(app)
        .get('/api/saml/login')
        .expect(503);
      expect(response.body.error).toBe('SAML_DISABLED');
    });

    test('POST /api/saml/callback fails closed with 503 SAML_DISABLED', async () => {
      const response = await request(app)
        .post('/api/saml/callback')
        .send({ SAMLResponse: Buffer.from('<samlp:Response/>').toString('base64') })
        .expect(503);
      expect(response.body.error).toBe('SAML_DISABLED');
    });

    test('GET /api/saml/logout fails closed with 503 SAML_DISABLED', async () => {
      const response = await request(app)
        .get('/api/saml/logout')
        .expect(503);
      expect(response.body.error).toBe('SAML_DISABLED');
    });

    test('POST /api/saml/logout/callback fails closed with 503 SAML_DISABLED', async () => {
      const response = await request(app)
        .post('/api/saml/logout/callback')
        .send({})
        .expect(503);
      expect(response.body.error).toBe('SAML_DISABLED');
    });

    test('GET /api/saml/providers fails closed with 503 SAML_DISABLED', async () => {
      const response = await request(app)
        .get('/api/saml/providers')
        .expect(503);
      expect(response.body.error).toBe('SAML_DISABLED');
    });

    test('GET /api/saml/status reports disabled without leaking config', async () => {
      const response = await request(app)
        .get('/api/saml/status')
        .expect(200);

      expect(response.body).toEqual({
        enabled: false,
        configured: false,
        providers: []
      });
    });
  });

  describe('SamlService strategy management', () => {
    test('getStrategy throws before initialize()', () => {
      const service = new SamlService();
      expect(() => service.getStrategy()).toThrow('SAML service not initialized');
    });

    test('initialize() is a no-op while SAML is disabled', async () => {
      const service = new SamlService();
      await service.initialize();
      expect(service.initialized).toBe(false);
      expect(service.strategies.size).toBe(0);
    });

    test('getIdentityProviders returns [] with no IdPs configured', () => {
      const service = new SamlService();
      expect(service.getIdentityProviders()).toEqual([]);
    });
  });

  describe('SAML attribute mapping', () => {
    const service = new SamlService();

    test('maps profile attributes using the configured attribute mapping', () => {
      const profile = {
        nameID: 'user@example.com',
        sessionIndex: 'sess-1',
        issuer: 'https://idp.example.com',
        attributes: {
          [samlConfig.attributeMapping.firstName]: 'Alice',
          [samlConfig.attributeMapping.lastName]: 'Wonder',
          [samlConfig.attributeMapping.displayName]: 'Alice Wonder'
        }
      };

      const mapped = service.mapSAMLAttributes(profile);

      expect(mapped.email).toBe('user@example.com'); // nameID wins
      expect(mapped.firstName).toBe('Alice');
      expect(mapped.lastName).toBe('Wonder');
      expect(mapped.displayName).toBe('Alice Wonder');
      expect(mapped.samlNameId).toBe('user@example.com');
      expect(mapped.samlSessionIndex).toBe('sess-1');
      expect(mapped.samlIssuer).toBe('https://idp.example.com');
    });

    test('falls back to nameID for displayName when unmapped', () => {
      const profile = { nameID: 'minimal@example.com', attributes: {} };
      const mapped = service.mapSAMLAttributes(profile);
      expect(mapped.displayName).toBe('minimal@example.com');
      expect(mapped.firstName).toBeUndefined();
    });

    test('getAttributeValue handles single, array, and multiple modes', () => {
      const attrs = { groups: ['a', 'b'], single: 'x' };
      expect(service.getAttributeValue(attrs, 'single')).toBe('x');
      expect(service.getAttributeValue(attrs, 'groups')).toBe('a');
      expect(service.getAttributeValue(attrs, 'groups', true)).toEqual(['a', 'b']);
      expect(service.getAttributeValue(attrs, 'missing', true)).toEqual([]);
      expect(service.getAttributeValue(attrs, 'missing')).toBeUndefined();
      expect(service.getAttributeValue(null, 'anything')).toBeUndefined();
    });
  });

  describe('Just-in-Time (JIT) user provisioning', () => {
    const service = new SamlService();

    test('creates a new user from SAML attributes (auto-provision default on)', async () => {
      const user = await service.findOrCreateUser({
        email: 'newuser@example.com',
        displayName: 'John Doe',
        samlNameId: 'newuser@example.com',
        samlSessionIndex: 'sess-jit'
      }, 'default');

      expect(user).toBeDefined();
      expect(user.email).toBe('newuser@example.com');
      expect(user.displayName).toBe('John Doe');
      // SAML_REQUIRE_EMAIL_VERIFICATION is unset → SAML email is trusted
      expect(user.emailVerified).toBe(true);

      const models = getModels();
      const dbUser = await models.User.findOne({ where: { email: 'newuser@example.com' } });
      expect(dbUser).toBeTruthy();
    });

    test('finds an existing user by email instead of duplicating', async () => {
      const existingUser = await createTestUser({ email: 'existing@example.com' });

      const user = await service.findOrCreateUser({
        email: 'existing@example.com',
        displayName: 'Jane Smith'
      }, 'default');

      expect(user.id).toBe(existingUser.id);
      expect(user.email).toBe('existing@example.com');

      const models = getModels();
      const count = await models.User.count({ where: { email: 'existing@example.com' } });
      expect(count).toBe(1);
    });

    test('updates lastLoginAt on repeat SAML login', async () => {
      const existingUser = await createTestUser({ email: 'repeat@example.com' });
      expect(existingUser.lastLoginAt).toBeNull();

      const user = await service.findOrCreateUser({ email: 'repeat@example.com' }, 'default');
      expect(user.lastLoginAt).toBeTruthy();
    });

    test('handles missing optional attributes', async () => {
      const user = await service.findOrCreateUser({
        email: 'minimal@example.com'
        // no displayName / names
      }, 'default');

      expect(user).toBeDefined();
      expect(user.email).toBe('minimal@example.com');
    });

    test('rejects attributes without an email', async () => {
      await expect(
        service.findOrCreateUser({ firstName: 'Test', lastName: 'User' }, 'default')
      ).rejects.toThrow('Email is required');
    });
  });
});
