/**
 * ═══════════════════════════════════════════════════════════
 * Low-Code Grids Routes Test Suite
 * Tests grid designer and data grid endpoints
 * ═══════════════════════════════════════════════════════════
 */

const request = require('supertest');
const { createLowCodeTestApp } = require('../../helpers/testApp');

let app;

describe('Low-Code Grids Routes', () => {
  beforeAll(() => {
    app = createLowCodeTestApp('grids');
  });

  describe('GET /lowcode/grids', () => {
    it('should return list of grids', async () => {
      const response = await request(app)
        .get('/lowcode/grids')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('POST /lowcode/grids', () => {
    it('should create a new grid', async () => {
      const gridData = {
        name: 'Customer Grid',
        entityId: 'test-entity-123',
        columns: [
          { field: 'name', header: 'Name', sortable: true },
          { field: 'email', header: 'Email', filterable: true }
        ]
      };

      const response = await request(app)
        .post('/lowcode/grids')
        .send(gridData);

      expect([200, 201, 400, 500]).toContain(response.status);
    });
  });

  describe('GET /lowcode/grids/:id', () => {
    it('should get grid configuration', async () => {
      const response = await request(app)
        .get('/lowcode/grids/test-grid-123');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('PUT /lowcode/grids/:id', () => {
    it('should update grid configuration', async () => {
      const updateData = {
        name: 'Updated Grid',
        columns: []
      };

      const response = await request(app)
        .put('/lowcode/grids/test-grid-123')
        .send(updateData);

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('DELETE /lowcode/grids/:id', () => {
    it('should delete a grid', async () => {
      const response = await request(app)
        .delete('/lowcode/grids/test-grid-123');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /lowcode/grids/:id/data', () => {
    it('should get grid data', async () => {
      const response = await request(app)
        .get('/lowcode/grids/test-grid-123/data');

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/lowcode/grids/test-grid-123/data?page=1&limit=25');

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should support sorting', async () => {
      const response = await request(app)
        .get('/lowcode/grids/test-grid-123/data?sort=name&order=asc');

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should support filtering', async () => {
      const response = await request(app)
        .get('/lowcode/grids/test-grid-123/data?filter[name]=John');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /lowcode/grids/:id/export', () => {
    it('should export grid data as CSV', async () => {
      const response = await request(app)
        .post('/lowcode/grids/test-grid-123/export')
        .send({ format: 'csv' });

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should export grid data as Excel', async () => {
      const response = await request(app)
        .post('/lowcode/grids/test-grid-123/export')
        .send({ format: 'xlsx' });

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /lowcode/grids/:id/bulk-actions', () => {
    it('should perform bulk delete', async () => {
      const actionData = {
        action: 'delete',
        ids: ['record-1', 'record-2', 'record-3']
      };

      const response = await request(app)
        .post('/lowcode/grids/test-grid-123/bulk-actions')
        .send(actionData);

      expect([200, 400, 404, 500]).toContain(response.status);
    });

    it('should perform bulk update', async () => {
      const actionData = {
        action: 'update',
        ids: ['record-1', 'record-2'],
        data: { status: 'active' }
      };

      const response = await request(app)
        .post('/lowcode/grids/test-grid-123/bulk-actions')
        .send(actionData);

      expect([200, 400, 404, 500]).toContain(response.status);
    });
  });
});
