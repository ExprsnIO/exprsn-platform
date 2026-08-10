/**
 * Integration Tests for Exprsn Bridge
 *
 * Tests lexicon loading, routing, authentication, validation, and proxying.
 */

const request = require('supertest');
const path = require('path');

// Mock environment variables before requiring app
process.env.NODE_ENV = 'test';
process.env.PORT = '3010';
process.env.CA_SERVICE_URL = 'http://localhost:3000';
process.env.AUTH_SERVICE_URL = 'http://localhost:3001';
process.env.LOG_LEVEL = 'error';

describe('Exprsn Bridge - Integration Tests', () => {
  let app;

  beforeAll(() => {
    // Require app after setting env vars
    app = require('../src/index');
  });

  describe('Core Endpoints', () => {
    test('GET / returns service information', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body.service).toBe('Exprsn Bridge');
      expect(response.body.version).toBe('1.0.0');
      expect(response.body.lexicons).toBeDefined();
      expect(response.body.totalRoutes).toBeGreaterThan(0);
      expect(response.body.features).toContain('Token-based authentication');
    });

    test('GET /health returns healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('exprsn-bridge');
      expect(response.body.timestamp).toBeDefined();
    });

    test('GET /nonexistent returns 404', async () => {
      const response = await request(app)
        .get('/nonexistent')
        .expect(404);

      expect(response.body.error).toBe('Route not found');
    });
  });

  describe('Service Discovery', () => {
    test('GET /api/discovery/services lists all services', async () => {
      const response = await request(app)
        .get('/api/discovery/services')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.services).toBeInstanceOf(Array);
      expect(response.body.data.count).toBeGreaterThan(0);

      // Check service structure
      const service = response.body.data.services[0];
      expect(service).toHaveProperty('name');
      expect(service).toHaveProperty('url');
      expect(service).toHaveProperty('port');
      expect(service).toHaveProperty('protocol');
    });

    test('GET /api/discovery/services/:name returns specific service', async () => {
      const response = await request(app)
        .get('/api/discovery/services/ca')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('ca');
      expect(response.body.data.url).toContain('3000');
    });

    test('GET /api/discovery/services/:name returns 404 for unknown service', async () => {
      const response = await request(app)
        .get('/api/discovery/services/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('SERVICE_NOT_FOUND');
    });

    test('GET /api/discovery/health/all returns health status', async () => {
      const response = await request(app)
        .get('/api/discovery/health/all?timeout=1000')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.overall).toBeDefined();
      expect(response.body.data.services).toBeInstanceOf(Array);
      expect(response.body.data.healthy).toBeDefined();
      expect(response.body.data.total).toBeDefined();

      // Check service health structure
      if (response.body.data.services.length > 0) {
        const serviceHealth = response.body.data.services[0];
        expect(serviceHealth).toHaveProperty('service');
        expect(serviceHealth).toHaveProperty('status');
        expect(['healthy', 'unhealthy', 'unreachable']).toContain(serviceHealth.status);
      }
    });

    test('GET /api/discovery/health/:service returns service health', async () => {
      const response = await request(app)
        .get('/api/discovery/health/ca?timeout=1000');

      expect(response.body.data.service).toBe('ca');
      expect(response.body.data.status).toBeDefined();
    });

    test('GET /api/discovery/metrics returns aggregated metrics', async () => {
      const response = await request(app)
        .get('/api/discovery/metrics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.bridge).toBeDefined();
      expect(response.body.data.bridge.uptime).toBeGreaterThan(0);
      expect(response.body.data.bridge.memory).toBeDefined();
    });
  });

  describe('Admin Endpoints (Authentication Required)', () => {
    test('GET /api/admin/lexicons without auth returns 401', async () => {
      const response = await request(app)
        .get('/api/admin/lexicons')
        .expect(401);

      expect(response.body.error).toBe('AUTHENTICATION_REQUIRED');
    });

    test('GET /api/admin/routes without auth returns 401', async () => {
      const response = await request(app)
        .get('/api/admin/routes')
        .expect(401);

      expect(response.body.error).toBe('AUTHENTICATION_REQUIRED');
    });

    test('GET /api/admin/stats without auth returns 401', async () => {
      const response = await request(app)
        .get('/api/admin/stats')
        .expect(401);

      expect(response.body.error).toBe('AUTHENTICATION_REQUIRED');
    });

    test('POST /api/admin/lexicons/reload without auth returns 401', async () => {
      const response = await request(app)
        .post('/api/admin/lexicons/reload')
        .expect(401);

      expect(response.body.error).toBe('AUTHENTICATION_REQUIRED');
    });

    // Note: Testing with valid tokens requires CA service to be running
    // These tests would be in integration tests with full stack
  });

  describe('Rate Limiting', () => {
    test('Multiple requests within window should succeed', async () => {
      // Global rate limit is 1000 per 15 minutes, so a few requests should work
      for (let i = 0; i < 5; i++) {
        await request(app)
          .get('/health')
          .expect(200);
      }
    });

    // Note: Testing actual rate limit exhaustion would require many requests
    // and is better suited for load testing rather than unit tests
  });

  describe('Lexicon Loading', () => {
    test('Lexicons are loaded on startup', () => {
      const lexiconLoader = app.locals.lexiconLoader;
      expect(lexiconLoader).toBeDefined();

      const lexicons = lexiconLoader.getAllLexicons();
      expect(lexicons.size).toBeGreaterThan(0);
    });

    test('CA lexicon is loaded', () => {
      const lexiconLoader = app.locals.lexiconLoader;
      const routes = lexiconLoader.getAllRoutes();

      const caRoutes = routes.filter(r => r._source.service === 'exprsn-ca');
      expect(caRoutes.length).toBeGreaterThan(0);
    });

    test('Auth lexicon is loaded', () => {
      const lexiconLoader = app.locals.lexiconLoader;
      const routes = lexiconLoader.getAllRoutes();

      const authRoutes = routes.filter(r => r._source.service === 'exprsn-auth');
      expect(authRoutes.length).toBeGreaterThan(0);
    });

    test('New service lexicons are loaded (forge, payments, atlas, etc.)', () => {
      const lexiconLoader = app.locals.lexiconLoader;
      const lexicons = lexiconLoader.getAllLexicons();
      const lexiconNames = Array.from(lexicons.values()).map(l => l.lexicon.service.name);

      expect(lexiconNames).toContain('exprsn-forge');
      expect(lexiconNames).toContain('exprsn-payments');
      expect(lexiconNames).toContain('exprsn-atlas');
      expect(lexiconNames).toContain('exprsn-dbadmin');
      expect(lexiconNames).toContain('exprsn-bluesky');
    });
  });

  describe('Request Validation', () => {
    // Note: These tests would require mocking the backend services
    // or running with actual services. For now, we test that validation
    // middleware is applied by checking route configuration

    test('Routes with validation have validation middleware', () => {
      const lexiconLoader = app.locals.lexiconLoader;
      const routes = lexiconLoader.getAllRoutes();

      const routesWithValidation = routes.filter(r => r.validation);
      expect(routesWithValidation.length).toBeGreaterThan(0);

      // Check structure of validation config
      const validatedRoute = routesWithValidation[0];
      if (validatedRoute.validation.body) {
        expect(validatedRoute.validation.body.type).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    test('Invalid JSON returns proper error', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('invalid json{')
        .expect(400);

      // Express will handle malformed JSON before it reaches our middleware
    });

    test('Missing required headers are handled gracefully', async () => {
      const response = await request(app)
        .get('/api/admin/lexicons');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('AUTHENTICATION_REQUIRED');
    });
  });
});

describe('Lexicon Loader', () => {
  const LexiconLoader = require('../src/lexicon/loader');
  let loader;

  beforeEach(() => {
    loader = new LexiconLoader({
      lexiconDir: path.join(__dirname, '../src/config/lexicons'),
      watchForChanges: false
    });
  });

  test('Loads lexicons from directory', async () => {
    await loader.loadAllLexicons();
    const lexicons = loader.getAllLexicons();

    expect(lexicons.size).toBeGreaterThan(0);
  });

  test('Validates lexicon schema', async () => {
    await loader.loadAllLexicons();
    const lexicons = loader.getAllLexicons();

    for (const [filename, lexicon] of lexicons) {
      expect(lexicon.lexicon).toBeDefined();
      expect(lexicon.lexicon.version).toBe('1.0');
      expect(lexicon.lexicon.service).toBeDefined();
      expect(lexicon.lexicon.service.name).toBeDefined();
      expect(lexicon.lexicon.routes).toBeInstanceOf(Array);
    }
  });

  test('Returns all routes with source information', async () => {
    await loader.loadAllLexicons();
    const routes = loader.getAllRoutes();

    expect(routes.length).toBeGreaterThan(0);

    const route = routes[0];
    expect(route.path).toBeDefined();
    expect(route.method).toBeDefined();
    expect(route.target).toBeDefined();
    expect(route._source).toBeDefined();
    expect(route._source.service).toBeDefined();
  });

  test('Can get specific lexicon', async () => {
    await loader.loadAllLexicons();
    const files = await require('fs').promises.readdir(
      path.join(__dirname, '../src/config/lexicons')
    );
    const lexiconFile = files.find(f => f.endsWith('.lexicon.json'));

    const lexicon = loader.getLexicon(lexiconFile);
    expect(lexicon).toBeDefined();
  });

  test('Returns null for non-existent lexicon', async () => {
    await loader.loadAllLexicons();
    const lexicon = loader.getLexicon('nonexistent.json');
    expect(lexicon).toBeNull();
  });
});

describe('Middleware', () => {
  describe('Validation Middleware', () => {
    const { validate } = require('../src/middleware/validation');

    test('Validates data against schema', () => {
      const schema = {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 }
        }
      };

      const validData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const result = validate(schema, validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('Returns errors for invalid data', () => {
      const schema = {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      };

      const invalidData = {
        email: 'not-an-email'
      };

      const result = validate(schema, invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Permission Middleware', () => {
    const { hasPermission, hasAnyPermission, hasAllPermissions } = require('../src/middleware/permissions');

    test('hasPermission returns true when permission granted', () => {
      const token = {
        permissions: {
          read: true,
          write: false
        }
      };

      expect(hasPermission(token, 'read')).toBe(true);
      expect(hasPermission(token, 'write')).toBe(false);
    });

    test('hasAnyPermission returns true if any permission granted', () => {
      const token = {
        permissions: {
          read: true,
          write: false,
          delete: false
        }
      };

      expect(hasAnyPermission(token, ['read', 'write'])).toBe(true);
      expect(hasAnyPermission(token, ['write', 'delete'])).toBe(false);
    });

    test('hasAllPermissions returns true only if all granted', () => {
      const token = {
        permissions: {
          read: true,
          write: true,
          delete: false
        }
      };

      expect(hasAllPermissions(token, ['read', 'write'])).toBe(true);
      expect(hasAllPermissions(token, ['read', 'write', 'delete'])).toBe(false);
    });
  });
});
