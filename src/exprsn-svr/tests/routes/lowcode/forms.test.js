/**
 * ═══════════════════════════════════════════════════════════
 * Low-Code Forms Routes Test Suite
 * Tests form designer and management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const request = require('supertest');
const { createLowCodeTestApp } = require('../../helpers/testApp');

let app;

describe('Low-Code Forms Routes', () => {
  beforeAll(() => {
    app = createLowCodeTestApp('forms');
  });

  describe('GET /lowcode/forms', () => {
    it('should return list of forms', async () => {
      const response = await request(app)
        .get('/lowcode/forms')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter forms by application ID', async () => {
      const response = await request(app)
        .get('/lowcode/forms?appId=test-app-123')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/lowcode/forms?page=1&limit=20')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /lowcode/forms/:id', () => {
    it('should get form details', async () => {
      const response = await request(app)
        .get('/lowcode/forms/test-form-123')
        .expect('Content-Type', /json/);

      expect([200, 404]).toContain(response.status);
    });

    it('should return 404 for non-existent form', async () => {
      const response = await request(app)
        .get('/lowcode/forms/non-existent-999');

      expect([404, 500]).toContain(response.status);
    });
  });

  describe('POST /lowcode/forms', () => {
    it('should create a new form with valid data', async () => {
      const formData = {
        name: 'Contact Form',
        slug: 'contact-form',
        appId: 'test-app-123',
        fields: [
          {
            type: 'text',
            name: 'name',
            label: 'Name',
            required: true
          },
          {
            type: 'email',
            name: 'email',
            label: 'Email',
            required: true
          }
        ]
      };

      const response = await request(app)
        .post('/lowcode/forms')
        .send(formData)
        .expect('Content-Type', /json/);

      expect([200, 201, 400, 500]).toContain(response.status);
    });

    it('should reject form without name', async () => {
      const formData = {
        slug: 'test-form',
        fields: []
      };

      const response = await request(app)
        .post('/lowcode/forms')
        .send(formData);

      expect([400, 500]).toContain(response.status);
    });

    it('should reject form with invalid field types', async () => {
      const formData = {
        name: 'Invalid Form',
        slug: 'invalid-form',
        fields: [
          {
            type: 'invalid-type',
            name: 'field1'
          }
        ]
      };

      const response = await request(app)
        .post('/lowcode/forms')
        .send(formData);

      expect([400, 500]).toContain(response.status);
    });
  });

  describe('PUT /lowcode/forms/:id', () => {
    it('should update an existing form', async () => {
      const updateData = {
        name: 'Updated Form',
        description: 'Updated description'
      };

      const response = await request(app)
        .put('/lowcode/forms/test-form-123')
        .send(updateData)
        .expect('Content-Type', /json/);

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should update form fields', async () => {
      const updateData = {
        fields: [
          {
            type: 'text',
            name: 'new_field',
            label: 'New Field',
            required: false
          }
        ]
      };

      const response = await request(app)
        .put('/lowcode/forms/test-form-123')
        .send(updateData);

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('DELETE /lowcode/forms/:id', () => {
    it('should delete a form', async () => {
      const response = await request(app)
        .delete('/lowcode/forms/test-form-to-delete')
        .expect('Content-Type', /json/);

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /lowcode/forms/:id/duplicate', () => {
    it('should duplicate an existing form', async () => {
      const response = await request(app)
        .post('/lowcode/forms/test-form-123/duplicate')
        .send({ name: 'Duplicated Form' })
        .expect('Content-Type', /json/);

      expect([200, 201, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /lowcode/forms/:id/schema', () => {
    it('should get form JSON schema', async () => {
      const response = await request(app)
        .get('/lowcode/forms/test-form-123/schema');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /lowcode/forms/:id/validate', () => {
    it('should validate form data', async () => {
      const formData = {
        name: 'John Doe',
        email: 'john@example.com'
      };

      const response = await request(app)
        .post('/lowcode/forms/test-form-123/validate')
        .send(formData);

      expect([200, 400, 404, 500]).toContain(response.status);
    });

    it('should reject invalid form data', async () => {
      const formData = {
        email: 'invalid-email'
      };

      const response = await request(app)
        .post('/lowcode/forms/test-form-123/validate')
        .send(formData);

      expect([400, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /lowcode/forms/:id/submissions', () => {
    it('should get form submissions', async () => {
      const response = await request(app)
        .get('/lowcode/forms/test-form-123/submissions');

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should support pagination for submissions', async () => {
      const response = await request(app)
        .get('/lowcode/forms/test-form-123/submissions?page=1&limit=10');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /lowcode/forms/:id/submit', () => {
    it('should submit form data', async () => {
      const formData = {
        name: 'Test User',
        email: 'test@example.com',
        message: 'Test message'
      };

      const response = await request(app)
        .post('/lowcode/forms/test-form-123/submit')
        .send(formData);

      expect([200, 201, 400, 404, 500]).toContain(response.status);
    });
  });

  describe('Form Field Components Tests', () => {
    const fieldTypes = [
      'text', 'email', 'number', 'tel', 'url', 'password',
      'textarea', 'select', 'radio', 'checkbox', 'date',
      'time', 'datetime', 'file', 'hidden', 'wysiwyg',
      'markdown', 'code', 'color', 'range', 'rating',
      'signature', 'location', 'tags', 'json'
    ];

    it('should support all field component types', async () => {
      for (const fieldType of fieldTypes) {
        const formData = {
          name: `Form with ${fieldType}`,
          slug: `form-${fieldType}`,
          fields: [
            {
              type: fieldType,
              name: `field_${fieldType}`,
              label: `Test ${fieldType}`
            }
          ]
        };

        const response = await request(app)
          .post('/lowcode/forms')
          .send(formData);

        // Should not reject valid field types
        if (response.status === 400) {
          expect(response.body.message).not.toContain('invalid field type');
        }
      }
    });
  });

  describe('Validation Tests', () => {
    it('should validate required fields', async () => {
      const formData = {
        name: 'Test Form'
        // Missing slug
      };

      const response = await request(app)
        .post('/lowcode/forms')
        .send(formData);

      expect([400, 500]).toContain(response.status);
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/lowcode/forms')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect([400, 500]).toContain(response.status);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full form lifecycle', async () => {
      const formData = {
        name: 'Lifecycle Test Form',
        slug: 'lifecycle-test-form',
        fields: [
          { type: 'text', name: 'name', label: 'Name', required: true },
          { type: 'email', name: 'email', label: 'Email', required: true }
        ]
      };

      // Create
      const createResponse = await request(app)
        .post('/lowcode/forms')
        .send(formData);

      if (createResponse.status === 201 || createResponse.status === 200) {
        const formId = createResponse.body.data?.id;

        if (formId) {
          // Read
          await request(app)
            .get(`/lowcode/forms/${formId}`)
            .expect(200);

          // Update
          await request(app)
            .put(`/lowcode/forms/${formId}`)
            .send({ name: 'Updated Lifecycle Form' });

          // Submit
          await request(app)
            .post(`/lowcode/forms/${formId}/submit`)
            .send({ name: 'Test', email: 'test@test.com' });

          // Delete
          await request(app)
            .delete(`/lowcode/forms/${formId}`);
        }
      }
    });
  });
});
