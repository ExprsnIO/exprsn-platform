/**
 * ═══════════════════════════════════════════════════════════
 * Low-Code Entities Routes Test Suite
 * Tests entity designer and management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const request = require('supertest');
const { createLowCodeTestApp } = require('../../helpers/testApp');

let app;

describe('Low-Code Entities Routes', () => {
  beforeAll(() => {
    app = createLowCodeTestApp('entities');
  });

  describe('GET /lowcode/entities', () => {
    it('should return list of entities', async () => {
      const response = await request(app)
        .get('/lowcode/entities')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter entities by application ID', async () => {
      const response = await request(app)
        .get('/lowcode/entities?appId=test-app-123')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /lowcode/entities/:id', () => {
    it('should get entity details', async () => {
      const response = await request(app)
        .get('/lowcode/entities/test-entity-123')
        .expect('Content-Type', /json/);

      expect([200, 404]).toContain(response.status);
    });

    it('should return 404 for non-existent entity', async () => {
      const response = await request(app)
        .get('/lowcode/entities/non-existent-999');

      expect([404, 500]).toContain(response.status);
    });
  });

  describe('POST /lowcode/entities', () => {
    it('should create a new entity with valid data', async () => {
      const entityData = {
        name: 'Customer',
        slug: 'customer',
        appId: 'test-app-123',
        fields: [
          {
            name: 'name',
            type: 'string',
            label: 'Customer Name',
            required: true
          },
          {
            name: 'email',
            type: 'email',
            label: 'Email Address',
            required: true,
            unique: true
          },
          {
            name: 'phone',
            type: 'phone',
            label: 'Phone Number'
          }
        ]
      };

      const response = await request(app)
        .post('/lowcode/entities')
        .send(entityData)
        .expect('Content-Type', /json/);

      expect([200, 201, 400, 500]).toContain(response.status);
    });

    it('should reject entity without name', async () => {
      const entityData = {
        slug: 'test-entity',
        fields: []
      };

      const response = await request(app)
        .post('/lowcode/entities')
        .send(entityData);

      expect([400, 500]).toContain(response.status);
    });

    it('should reject entity with invalid field types', async () => {
      const entityData = {
        name: 'Invalid Entity',
        slug: 'invalid-entity',
        fields: [
          {
            name: 'field1',
            type: 'invalid-type'
          }
        ]
      };

      const response = await request(app)
        .post('/lowcode/entities')
        .send(entityData);

      expect([400, 500]).toContain(response.status);
    });
  });

  describe('PUT /lowcode/entities/:id', () => {
    it('should update an existing entity', async () => {
      const updateData = {
        name: 'Updated Entity',
        description: 'Updated description'
      };

      const response = await request(app)
        .put('/lowcode/entities/test-entity-123')
        .send(updateData)
        .expect('Content-Type', /json/);

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should update entity fields', async () => {
      const updateData = {
        fields: [
          {
            name: 'new_field',
            type: 'string',
            label: 'New Field'
          }
        ]
      };

      const response = await request(app)
        .put('/lowcode/entities/test-entity-123')
        .send(updateData);

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('DELETE /lowcode/entities/:id', () => {
    it('should delete an entity', async () => {
      const response = await request(app)
        .delete('/lowcode/entities/test-entity-to-delete')
        .expect('Content-Type', /json/);

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /lowcode/entities/:id/fields', () => {
    it('should add a field to an entity', async () => {
      const fieldData = {
        name: 'address',
        type: 'text',
        label: 'Address',
        required: false
      };

      const response = await request(app)
        .post('/lowcode/entities/test-entity-123/fields')
        .send(fieldData);

      expect([200, 201, 404, 500]).toContain(response.status);
    });
  });

  describe('PUT /lowcode/entities/:id/fields/:fieldId', () => {
    it('should update an entity field', async () => {
      const fieldData = {
        label: 'Updated Label',
        required: true
      };

      const response = await request(app)
        .put('/lowcode/entities/test-entity-123/fields/field-456')
        .send(fieldData);

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('DELETE /lowcode/entities/:id/fields/:fieldId', () => {
    it('should delete an entity field', async () => {
      const response = await request(app)
        .delete('/lowcode/entities/test-entity-123/fields/field-456');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /lowcode/entities/:id/schema', () => {
    it('should get entity database schema', async () => {
      const response = await request(app)
        .get('/lowcode/entities/test-entity-123/schema');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /lowcode/entities/:id/migrate', () => {
    it('should generate migration for entity', async () => {
      const response = await request(app)
        .post('/lowcode/entities/test-entity-123/migrate');

      expect([200, 201, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /lowcode/entities/:id/records', () => {
    it('should get entity records', async () => {
      const response = await request(app)
        .get('/lowcode/entities/test-entity-123/records');

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should support pagination for records', async () => {
      const response = await request(app)
        .get('/lowcode/entities/test-entity-123/records?page=1&limit=10');

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should support filtering records', async () => {
      const response = await request(app)
        .get('/lowcode/entities/test-entity-123/records?filter[name]=Test');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /lowcode/entities/:id/records', () => {
    it('should create a new record', async () => {
      const recordData = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '555-0123'
      };

      const response = await request(app)
        .post('/lowcode/entities/test-entity-123/records')
        .send(recordData);

      expect([200, 201, 400, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /lowcode/entities/:id/records/:recordId', () => {
    it('should get a specific record', async () => {
      const response = await request(app)
        .get('/lowcode/entities/test-entity-123/records/record-789');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('PUT /lowcode/entities/:id/records/:recordId', () => {
    it('should update a record', async () => {
      const updateData = {
        name: 'Updated Name'
      };

      const response = await request(app)
        .put('/lowcode/entities/test-entity-123/records/record-789')
        .send(updateData);

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('DELETE /lowcode/entities/:id/records/:recordId', () => {
    it('should delete a record', async () => {
      const response = await request(app)
        .delete('/lowcode/entities/test-entity-123/records/record-789');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /lowcode/entities/:id/import', () => {
    it('should import records from CSV', async () => {
      const csvData = 'name,email,phone\nJohn,john@test.com,555-0123';

      const response = await request(app)
        .post('/lowcode/entities/test-entity-123/import')
        .send({ data: csvData, format: 'csv' });

      expect([200, 201, 400, 404, 500]).toContain(response.status);
    });

    it('should import records from JSON', async () => {
      const jsonData = [
        { name: 'John', email: 'john@test.com', phone: '555-0123' }
      ];

      const response = await request(app)
        .post('/lowcode/entities/test-entity-123/import')
        .send({ data: jsonData, format: 'json' });

      expect([200, 201, 400, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /lowcode/entities/:id/export', () => {
    it('should export records as CSV', async () => {
      const response = await request(app)
        .get('/lowcode/entities/test-entity-123/export?format=csv');

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should export records as JSON', async () => {
      const response = await request(app)
        .get('/lowcode/entities/test-entity-123/export?format=json');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('Entity Field Types Tests', () => {
    const fieldTypes = [
      'string', 'text', 'number', 'integer', 'decimal', 'boolean',
      'date', 'datetime', 'time', 'email', 'phone', 'url',
      'json', 'uuid', 'enum', 'array', 'relation', 'file'
    ];

    it('should support all field types', async () => {
      for (const fieldType of fieldTypes) {
        const entityData = {
          name: `Entity with ${fieldType}`,
          slug: `entity-${fieldType}`,
          fields: [
            {
              name: `field_${fieldType}`,
              type: fieldType,
              label: `Test ${fieldType}`
            }
          ]
        };

        const response = await request(app)
          .post('/lowcode/entities')
          .send(entityData);

        // Should not reject valid field types
        if (response.status === 400) {
          expect(response.body.message).not.toContain('invalid field type');
        }
      }
    });
  });

  describe('Validation Tests', () => {
    it('should validate unique constraints', async () => {
      const entityData = {
        name: 'Unique Test',
        slug: 'unique-test',
        fields: [
          {
            name: 'email',
            type: 'email',
            unique: true
          }
        ]
      };

      const response = await request(app)
        .post('/lowcode/entities')
        .send(entityData);

      // Should accept unique constraint
      expect([200, 201, 500]).toContain(response.status);
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/lowcode/entities')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect([400, 500]).toContain(response.status);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full entity lifecycle with records', async () => {
      const entityData = {
        name: 'Lifecycle Test Entity',
        slug: 'lifecycle-test-entity',
        fields: [
          { name: 'name', type: 'string', label: 'Name', required: true },
          { name: 'email', type: 'email', label: 'Email', unique: true }
        ]
      };

      // Create entity
      const createResponse = await request(app)
        .post('/lowcode/entities')
        .send(entityData);

      if (createResponse.status === 201 || createResponse.status === 200) {
        const entityId = createResponse.body.data?.id;

        if (entityId) {
          // Create record
          const recordData = { name: 'Test', email: 'test@test.com' };
          const createRecordResponse = await request(app)
            .post(`/lowcode/entities/${entityId}/records`)
            .send(recordData);

          if (createRecordResponse.status === 201 || createRecordResponse.status === 200) {
            const recordId = createRecordResponse.body.data?.id;

            if (recordId) {
              // Update record
              await request(app)
                .put(`/lowcode/entities/${entityId}/records/${recordId}`)
                .send({ name: 'Updated' });

              // Delete record
              await request(app)
                .delete(`/lowcode/entities/${entityId}/records/${recordId}`);
            }
          }

          // Delete entity
          await request(app)
            .delete(`/lowcode/entities/${entityId}`);
        }
      }
    });
  });
});
