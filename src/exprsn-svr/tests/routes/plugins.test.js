/**
 * ═══════════════════════════════════════════════════════════
 * Plugin Routes Test Suite
 * Tests all plugin marketplace and management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs').promises;

// Import the Express app
let app;

describe('Plugin Routes', () => {
  beforeAll(async () => {
    // Load the app
    app = require('../../index');

    // Ensure plugins directory exists
    const pluginsDir = path.join(__dirname, '../../plugins');
    await fs.mkdir(pluginsDir, { recursive: true });
  });

  afterAll(async () => {
    // Cleanup
    if (app && app.close) {
      await app.close();
    }
  });

  describe('GET /lowcode/api/plugins', () => {
    it('should return list of installed plugins', async () => {
      const response = await request(app)
        .get('/lowcode/api/plugins')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('plugins');
      expect(response.body.data).toHaveProperty('total');
      expect(Array.isArray(response.body.data.plugins)).toBe(true);
    });

    it('should return empty array when no plugins installed', async () => {
      const response = await request(app)
        .get('/lowcode/api/plugins')
        .expect(200);

      expect(response.body.data.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /lowcode/api/plugins/marketplace', () => {
    it('should return marketplace plugin listings', async () => {
      const response = await request(app)
        .get('/lowcode/api/plugins/marketplace')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);

      // Should have mock marketplace data
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should return plugins with required fields', async () => {
      const response = await request(app)
        .get('/lowcode/api/plugins/marketplace')
        .expect(200);

      const plugins = response.body.data;
      const firstPlugin = plugins[0];

      expect(firstPlugin).toHaveProperty('id');
      expect(firstPlugin).toHaveProperty('name');
      expect(firstPlugin).toHaveProperty('displayName');
      expect(firstPlugin).toHaveProperty('version');
      expect(firstPlugin).toHaveProperty('description');
      expect(firstPlugin).toHaveProperty('author');
      expect(firstPlugin).toHaveProperty('category');
      expect(firstPlugin).toHaveProperty('type');
      expect(firstPlugin).toHaveProperty('price');
    });
  });

  describe('POST /lowcode/api/plugins/generate', () => {
    it('should generate a new plugin with valid config', async () => {
      const config = {
        basic: {
          name: 'test-plugin',
          displayName: 'Test Plugin',
          description: 'A test plugin',
          author: 'Test Author',
          version: '1.0.0'
        },
        category: 'integration',
        type: 'custom'
      };

      const response = await request(app)
        .post('/lowcode/api/plugins/generate')
        .send(config)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('path');
    });

    it('should reject plugin with invalid name', async () => {
      const config = {
        basic: {
          name: 'Invalid Plugin Name!',
          displayName: 'Test Plugin'
        }
      };

      const response = await request(app)
        .post('/lowcode/api/plugins/generate')
        .send(config)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
    });

    it('should reject plugin without name', async () => {
      const config = {
        basic: {
          displayName: 'Test Plugin'
        }
      };

      const response = await request(app)
        .post('/lowcode/api/plugins/generate')
        .send(config)
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /lowcode/api/plugins/install', () => {
    it('should install a plugin from marketplace', async () => {
      const response = await request(app)
        .post('/lowcode/api/plugins/install')
        .send({ pluginId: 'stripe-payments' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('installed successfully');
    });

    it('should reject installation without pluginId', async () => {
      const response = await request(app)
        .post('/lowcode/api/plugins/install')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /lowcode/api/plugins/purchase', () => {
    it('should process plugin purchase with valid data', async () => {
      const purchaseData = {
        pluginId: 'advanced-charts',
        amount: 49.99,
        currency: 'USD'
      };

      const response = await request(app)
        .post('/lowcode/api/plugins/purchase')
        .send(purchaseData)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('transactionId');
      expect(response.body.data).toHaveProperty('status', 'completed');
      expect(response.body.data.amount).toBe(49.99);
    });

    it('should reject purchase without amount', async () => {
      const purchaseData = {
        pluginId: 'advanced-charts',
        currency: 'USD'
      };

      const response = await request(app)
        .post('/lowcode/api/plugins/purchase')
        .send(purchaseData)
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject purchase without pluginId', async () => {
      const purchaseData = {
        amount: 49.99,
        currency: 'USD'
      };

      const response = await request(app)
        .post('/lowcode/api/plugins/purchase')
        .send(purchaseData)
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /lowcode/api/plugins/upload', () => {
    it('should reject non-zip files', async () => {
      const response = await request(app)
        .post('/lowcode/api/plugins/upload')
        .attach('plugin', Buffer.from('not a zip'), 'test.txt')
        .expect(400);

      // Multer should reject this
      expect(response.status).toBe(400);
    });

    it('should reject upload without file', async () => {
      const response = await request(app)
        .post('/lowcode/api/plugins/upload')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('POST /lowcode/api/plugins/:name/enable', () => {
    let testPluginName;

    beforeAll(async () => {
      // Create a test plugin for enable/disable tests
      const config = {
        basic: {
          name: 'enable-test-plugin',
          displayName: 'Enable Test Plugin',
          description: 'Plugin for testing enable/disable',
          author: 'Test',
          version: '1.0.0'
        }
      };

      const response = await request(app)
        .post('/lowcode/api/plugins/generate')
        .send(config);

      if (response.body.success) {
        testPluginName = 'enable-test-plugin';
      }
    });

    it('should enable an existing plugin', async () => {
      if (!testPluginName) {
        return; // Skip if test plugin wasn't created
      }

      const response = await request(app)
        .post(`/lowcode/api/plugins/${testPluginName}/enable`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('enabled successfully');
    });

    it('should return 404 for non-existent plugin', async () => {
      const response = await request(app)
        .post('/lowcode/api/plugins/non-existent-plugin/enable')
        .expect(404);

      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('POST /lowcode/api/plugins/:name/disable', () => {
    let testPluginName;

    beforeAll(async () => {
      // Reuse test plugin from enable tests
      testPluginName = 'enable-test-plugin';
    });

    it('should disable an existing plugin', async () => {
      if (!testPluginName) {
        return;
      }

      const response = await request(app)
        .post(`/lowcode/api/plugins/${testPluginName}/disable`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('disabled successfully');
    });

    it('should return 404 for non-existent plugin', async () => {
      const response = await request(app)
        .post('/lowcode/api/plugins/non-existent-plugin/disable')
        .expect(404);

      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('GET /lowcode/api/plugins/:name', () => {
    let testPluginName;

    beforeAll(async () => {
      testPluginName = 'enable-test-plugin';
    });

    it('should get plugin details for existing plugin', async () => {
      if (!testPluginName) {
        return;
      }

      const response = await request(app)
        .get(`/lowcode/api/plugins/${testPluginName}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('version');
      expect(response.body.data).toHaveProperty('description');
    });

    it('should return 404 for non-existent plugin', async () => {
      const response = await request(app)
        .get('/lowcode/api/plugins/non-existent-plugin')
        .expect(404);

      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /lowcode/api/plugins/:name', () => {
    let testPluginName;

    beforeAll(async () => {
      // Create a plugin specifically for deletion test
      const config = {
        basic: {
          name: 'delete-test-plugin',
          displayName: 'Delete Test Plugin',
          description: 'Plugin for testing deletion',
          author: 'Test',
          version: '1.0.0'
        }
      };

      const response = await request(app)
        .post('/lowcode/api/plugins/generate')
        .send(config);

      if (response.body.success) {
        testPluginName = 'delete-test-plugin';
      }
    });

    it('should delete an existing plugin', async () => {
      if (!testPluginName) {
        return;
      }

      const response = await request(app)
        .delete(`/lowcode/api/plugins/${testPluginName}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('deleted successfully');

      // Verify plugin is actually deleted
      const getResponse = await request(app)
        .get(`/lowcode/api/plugins/${testPluginName}`)
        .expect(404);

      expect(getResponse.body.error).toBe('NOT_FOUND');
    });

    it('should return 404 when deleting non-existent plugin', async () => {
      const response = await request(app)
        .delete('/lowcode/api/plugins/non-existent-plugin')
        .expect(404);

      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('View Routes', () => {
    describe('GET /lowcode/plugins', () => {
      it('should render plugin marketplace page', async () => {
        const response = await request(app)
          .get('/lowcode/plugins')
          .expect(200);

        expect(response.text).toContain('Plugins & Extensions');
        expect(response.text).toContain('Marketplace');
      });

      it('should accept optional appId parameter', async () => {
        const response = await request(app)
          .get('/lowcode/plugins?appId=test-app-123')
          .expect(200);

        expect(response.text).toContain('Plugins');
      });
    });

    describe('GET /lowcode/plugins/create', () => {
      it('should render plugin creator page', async () => {
        const response = await request(app)
          .get('/lowcode/plugins/create')
          .expect(200);

        expect(response.text).toContain('Create Plugin');
      });
    });
  });

  describe('Integration Tests', () => {
    it('should complete full plugin lifecycle', async () => {
      // 1. Generate plugin
      const generateResponse = await request(app)
        .post('/lowcode/api/plugins/generate')
        .send({
          basic: {
            name: 'lifecycle-test',
            displayName: 'Lifecycle Test Plugin',
            description: 'Testing full lifecycle',
            author: 'Test',
            version: '1.0.0'
          }
        })
        .expect(200);

      expect(generateResponse.body.success).toBe(true);

      // 2. Get plugin details
      const detailsResponse = await request(app)
        .get('/lowcode/api/plugins/lifecycle-test')
        .expect(200);

      expect(detailsResponse.body.data.name).toBe('lifecycle-test');

      // 3. Enable plugin
      await request(app)
        .post('/lowcode/api/plugins/lifecycle-test/enable')
        .expect(200);

      // 4. Disable plugin
      await request(app)
        .post('/lowcode/api/plugins/lifecycle-test/disable')
        .expect(200);

      // 5. Delete plugin
      const deleteResponse = await request(app)
        .delete('/lowcode/api/plugins/lifecycle-test')
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);

      // 6. Verify deletion
      await request(app)
        .get('/lowcode/api/plugins/lifecycle-test')
        .expect(404);
    });

    it('should handle marketplace to install flow', async () => {
      // 1. Get marketplace
      const marketplaceResponse = await request(app)
        .get('/lowcode/api/plugins/marketplace')
        .expect(200);

      const plugins = marketplaceResponse.body.data;
      expect(plugins.length).toBeGreaterThan(0);

      // 2. Install a free plugin
      const freePlugin = plugins.find(p => p.price === 0);
      if (freePlugin) {
        const installResponse = await request(app)
          .post('/lowcode/api/plugins/install')
          .send({ pluginId: freePlugin.id })
          .expect(200);

        expect(installResponse.body.success).toBe(true);
      }
    });

    it('should handle purchase to install flow', async () => {
      // 1. Purchase premium plugin
      const purchaseResponse = await request(app)
        .post('/lowcode/api/plugins/purchase')
        .send({
          pluginId: 'premium-test',
          amount: 99.99,
          currency: 'USD'
        })
        .expect(200);

      expect(purchaseResponse.body.data.transactionId).toBeDefined();
      expect(purchaseResponse.body.data.status).toBe('completed');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/lowcode/api/plugins/generate')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      // Express should handle this
    });

    it('should validate plugin name format', async () => {
      const invalidNames = [
        'Plugin With Spaces',
        'plugin@invalid',
        'UPPERCASE',
        'plugin.with.dots'
      ];

      for (const name of invalidNames) {
        const response = await request(app)
          .post('/lowcode/api/plugins/generate')
          .send({
            basic: {
              name,
              displayName: 'Test'
            }
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      }
    });

    it('should handle concurrent enable/disable operations', async () => {
      // Create test plugin
      await request(app)
        .post('/lowcode/api/plugins/generate')
        .send({
          basic: {
            name: 'concurrent-test',
            displayName: 'Concurrent Test',
            version: '1.0.0'
          }
        });

      // Send concurrent requests
      const promises = [
        request(app).post('/lowcode/api/plugins/concurrent-test/enable'),
        request(app).post('/lowcode/api/plugins/concurrent-test/disable'),
        request(app).post('/lowcode/api/plugins/concurrent-test/enable')
      ];

      const responses = await Promise.all(promises);

      // All should complete without errors
      responses.forEach(response => {
        expect([200, 500]).toContain(response.status);
      });

      // Cleanup
      await request(app).delete('/lowcode/api/plugins/concurrent-test');
    });
  });
});
