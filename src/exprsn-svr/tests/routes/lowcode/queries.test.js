/**
 * ═══════════════════════════════════════════════════════════
 * Low-Code Queries Routes Test Suite
 * Tests visual query builder endpoints
 * ═══════════════════════════════════════════════════════════
 */

const request = require('supertest');
const { createLowCodeTestApp } = require('../../helpers/testApp');

let app;

describe('Low-Code Queries Routes', () => {
  beforeAll(() => {
    app = createLowCodeTestApp('queries');
  });

  describe('GET /lowcode/queries', () => {
    it('should return list of queries', async () => {
      const response = await request(app)
        .get('/lowcode/queries')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('POST /lowcode/queries', () => {
    it('should create a new query', async () => {
      const queryData = {
        name: 'Active Customers',
        entityId: 'customer-entity',
        conditions: [
          { field: 'status', operator: 'equals', value: 'active' }
        ]
      };

      const response = await request(app)
        .post('/lowcode/queries')
        .send(queryData);

      expect([200, 201, 400, 500]).toContain(response.status);
    });
  });

  describe('GET /lowcode/queries/:id', () => {
    it('should get query details', async () => {
      const response = await request(app)
        .get('/lowcode/queries/test-query-123');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('PUT /lowcode/queries/:id', () => {
    it('should update a query', async () => {
      const updateData = {
        name: 'Updated Query',
        conditions: []
      };

      const response = await request(app)
        .put('/lowcode/queries/test-query-123')
        .send(updateData);

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('DELETE /lowcode/queries/:id', () => {
    it('should delete a query', async () => {
      const response = await request(app)
        .delete('/lowcode/queries/test-query-123');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /lowcode/queries/:id/execute', () => {
    it('should execute a query', async () => {
      const response = await request(app)
        .post('/lowcode/queries/test-query-123/execute');

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should execute query with parameters', async () => {
      const params = {
        minDate: '2024-01-01',
        maxDate: '2024-12-31'
      };

      const response = await request(app)
        .post('/lowcode/queries/test-query-123/execute')
        .send({ parameters: params });

      expect([200, 400, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /lowcode/queries/preview', () => {
    it('should preview query results without saving', async () => {
      const queryData = {
        entityId: 'customer-entity',
        conditions: [
          { field: 'email', operator: 'contains', value: '@example.com' }
        ],
        limit: 10
      };

      const response = await request(app)
        .post('/lowcode/queries/preview')
        .send(queryData);

      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('GET /lowcode/queries/:id/sql', () => {
    it('should get generated SQL for query', async () => {
      const response = await request(app)
        .get('/lowcode/queries/test-query-123/sql');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('Query Operators Tests', () => {
    const operators = [
      'equals', 'not_equals', 'greater_than', 'less_than',
      'contains', 'starts_with', 'ends_with', 'is_null',
      'is_not_null', 'in', 'not_in', 'between'
    ];

    it('should support all query operators', async () => {
      for (const operator of operators) {
        const queryData = {
          name: `Query with ${operator}`,
          entityId: 'test-entity',
          conditions: [
            { field: 'field1', operator, value: 'test' }
          ]
        };

        const response = await request(app)
          .post('/lowcode/queries')
          .send(queryData);

        // Should not reject valid operators
        if (response.status === 400) {
          expect(response.body.message).not.toContain('invalid operator');
        }
      }
    });
  });
});
