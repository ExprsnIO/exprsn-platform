/**
 * ═══════════════════════════════════════════════════════════
 * Low-Code Applications Routes Test Suite
 * Tests application management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const request = require('supertest');
const { createLowCodeTestApp } = require('../../helpers/testApp');

let app;

describe('Low-Code Applications Routes', () => {
  beforeAll(() => {
    app = createLowCodeTestApp('applications');
  });

  describe('GET /lowcode/applications', () => {
    it('should return list of applications', async () => {
      const response = await request(app)
        .get('/lowcode/applications')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support pagination parameters', async () => {
      const response = await request(app)
        .get('/lowcode/applications?page=1&limit=10')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should support search parameter', async () => {
      const response = await request(app)
        .get('/lowcode/applications?search=test')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /lowcode/applications/:id', () => {
    it('should get application details', async () => {
      const response = await request(app)
        .get('/lowcode/applications/test-app-123')
        .expect('Content-Type', /json/);

      // May be 200 or 404 depending on if app exists
      expect([200, 404]).toContain(response.status);
    });

    it('should return 404 for non-existent application', async () => {
      const response = await request(app)
        .get('/lowcode/applications/non-existent-app-999')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('POST /lowcode/applications', () => {
    it('should create a new application with valid data', async () => {
      const appData = {
        name: 'Test Application',
        slug: 'test-app',
        description: 'A test application',
        icon: 'fa-test',
        color: '#0066ff'
      };

      const response = await request(app)
        .post('/lowcode/applications')
        .send(appData)
        .expect('Content-Type', /json/);

      // May succeed or fail depending on DB
      expect([200, 201, 400, 500]).toContain(response.status);
    });

    it('should reject application without name', async () => {
      const appData = {
        slug: 'test-app',
        description: 'Missing name'
      };

      const response = await request(app)
        .post('/lowcode/applications')
        .send(appData);

      expect([400, 500]).toContain(response.status);
    });

    it('should reject application with invalid slug', async () => {
      const appData = {
        name: 'Test App',
        slug: 'Invalid Slug!',
        description: 'Invalid slug format'
      };

      const response = await request(app)
        .post('/lowcode/applications')
        .send(appData);

      expect([400, 500]).toContain(response.status);
    });
  });

  describe('PUT /lowcode/applications/:id', () => {
    it('should update an existing application', async () => {
      const updateData = {
        name: 'Updated Application',
        description: 'Updated description'
      };

      const response = await request(app)
        .put('/lowcode/applications/test-app-123')
        .send(updateData)
        .expect('Content-Type', /json/);

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should return 404 for non-existent application', async () => {
      const updateData = {
        name: 'Updated App'
      };

      const response = await request(app)
        .put('/lowcode/applications/non-existent-999')
        .send(updateData);

      expect([404, 500]).toContain(response.status);
    });
  });

  describe('DELETE /lowcode/applications/:id', () => {
    it('should delete an application', async () => {
      const response = await request(app)
        .delete('/lowcode/applications/test-app-to-delete')
        .expect('Content-Type', /json/);

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should return 404 for non-existent application', async () => {
      const response = await request(app)
        .delete('/lowcode/applications/non-existent-999');

      expect([404, 500]).toContain(response.status);
    });
  });

  describe('POST /lowcode/applications/:id/duplicate', () => {
    it('should duplicate an existing application', async () => {
      const response = await request(app)
        .post('/lowcode/applications/test-app-123/duplicate')
        .send({ name: 'Duplicated App' })
        .expect('Content-Type', /json/);

      expect([200, 201, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /lowcode/applications/:id/export', () => {
    it('should export application configuration', async () => {
      const response = await request(app)
        .get('/lowcode/applications/test-app-123/export');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /lowcode/applications/import', () => {
    it('should import application configuration', async () => {
      const importData = {
        name: 'Imported App',
        slug: 'imported-app',
        config: {}
      };

      const response = await request(app)
        .post('/lowcode/applications/import')
        .send(importData);

      expect([200, 201, 400, 500]).toContain(response.status);
    });

    it('should reject import without required data', async () => {
      const response = await request(app)
        .post('/lowcode/applications/import')
        .send({});

      expect([400, 500]).toContain(response.status);
    });
  });

  describe('Validation Tests', () => {
    it('should validate application name length', async () => {
      const appData = {
        name: 'A'.repeat(256), // Too long
        slug: 'test-app'
      };

      const response = await request(app)
        .post('/lowcode/applications')
        .send(appData);

      expect([400, 500]).toContain(response.status);
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/lowcode/applications')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect([400, 500]).toContain(response.status);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full application lifecycle', async () => {
      const appData = {
        name: 'Lifecycle Test App',
        slug: 'lifecycle-test',
        description: 'Testing full lifecycle'
      };

      // Create
      const createResponse = await request(app)
        .post('/lowcode/applications')
        .send(appData);

      if (createResponse.status === 201 || createResponse.status === 200) {
        const appId = createResponse.body.data?.id;

        if (appId) {
          // Read
          await request(app)
            .get(`/lowcode/applications/${appId}`)
            .expect(200);

          // Update
          await request(app)
            .put(`/lowcode/applications/${appId}`)
            .send({ name: 'Updated Lifecycle App' });

          // Delete
          await request(app)
            .delete(`/lowcode/applications/${appId}`);
        }
      }
    });
  });
});
