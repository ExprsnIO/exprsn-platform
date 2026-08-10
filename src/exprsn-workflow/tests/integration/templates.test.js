const request = require('supertest');
const express = require('express');
const templateRoutes = require('../../src/routes/templates');
const templateService = require('../../src/services/templateService');
const auth = require('../../src/middleware/auth');

jest.mock('../../src/services/templateService');
jest.mock('../../src/middleware/auth');

describe('Template Routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/templates', templateRoutes);

    // Mock auth middleware
    auth.verifyToken = jest.fn((req, res, next) => {
      req.user = { id: global.mockUserId };
      next();
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/templates', () => {
    it('should return all templates', async () => {
      const mockTemplates = [
        { id: '1', name: 'Template 1' },
        { id: '2', name: 'Template 2' }
      ];

      templateService.getAllTemplates = jest.fn().mockResolvedValue(mockTemplates);

      const response = await request(app)
        .get('/api/templates')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.count).toBe(2);
    });

    it('should filter templates by category', async () => {
      templateService.getAllTemplates = jest.fn().mockResolvedValue([
        { id: '1', name: 'Template 1', template_category: 'Data Processing' }
      ]);

      const response = await request(app)
        .get('/api/templates?category=Data Processing')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(templateService.getAllTemplates).toHaveBeenCalledWith({
        category: 'Data Processing',
        tags: undefined,
        search: undefined
      });
    });

    it('should filter templates by tags', async () => {
      templateService.getAllTemplates = jest.fn().mockResolvedValue([]);

      await request(app)
        .get('/api/templates?tags=api,database')
        .expect(200);

      expect(templateService.getAllTemplates).toHaveBeenCalledWith({
        category: undefined,
        tags: ['api', 'database'],
        search: undefined
      });
    });

    it('should handle service errors', async () => {
      templateService.getAllTemplates = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/templates')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Database error');
    });
  });

  describe('GET /api/templates/categories', () => {
    it('should return template categories', async () => {
      const mockCategories = {
        'Data Processing': 3,
        'User Management': 2,
        'Approval': 1
      };

      templateService.getCategories = jest.fn().mockResolvedValue(mockCategories);

      const response = await request(app)
        .get('/api/templates/categories')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockCategories);
    });
  });

  describe('GET /api/templates/:id', () => {
    it('should return template by ID', async () => {
      const mockTemplate = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Template 1'
      };

      templateService.getTemplateById = jest.fn().mockResolvedValue(mockTemplate);

      const response = await request(app)
        .get('/api/templates/123e4567-e89b-12d3-a456-426614174000')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockTemplate);
    });

    it('should return 404 when template not found', async () => {
      templateService.getTemplateById = jest.fn().mockRejectedValue(new Error('Template not found'));

      const response = await request(app)
        .get('/api/templates/123e4567-e89b-12d3-a456-426614174000')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Template not found');
    });

    it('should return 400 for invalid UUID', async () => {
      const response = await request(app)
        .get('/api/templates/invalid-id')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/templates/:id/instantiate', () => {
    it('should create workflow from template', async () => {
      const mockWorkflow = {
        id: '999',
        name: 'New Workflow'
      };

      templateService.instantiateTemplate = jest.fn().mockResolvedValue(mockWorkflow);

      const response = await request(app)
        .post('/api/templates/123e4567-e89b-12d3-a456-426614174000/instantiate')
        .send({ name: 'New Workflow' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Workflow created from template');
      expect(response.body.data).toEqual(mockWorkflow);
      expect(auth.verifyToken).toHaveBeenCalled();
    });

    it('should apply customizations', async () => {
      templateService.instantiateTemplate = jest.fn().mockResolvedValue({});

      await request(app)
        .post('/api/templates/123e4567-e89b-12d3-a456-426614174000/instantiate')
        .send({
          name: 'Custom Name',
          description: 'Custom description',
          category: 'Custom',
          trigger_type: 'scheduled'
        })
        .expect(201);

      expect(templateService.instantiateTemplate).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        global.mockUserId,
        expect.objectContaining({
          name: 'Custom Name',
          description: 'Custom description',
          category: 'Custom',
          trigger_type: 'scheduled'
        })
      );
    });

    it('should validate input', async () => {
      const response = await request(app)
        .post('/api/templates/123e4567-e89b-12d3-a456-426614174000/instantiate')
        .send({ name: 123 }) // Invalid type
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/templates/from-workflow/:workflowId', () => {
    it('should create template from workflow', async () => {
      const mockTemplate = {
        id: '888',
        name: 'New Template',
        is_template: true
      };

      templateService.createTemplate = jest.fn().mockResolvedValue(mockTemplate);

      const response = await request(app)
        .post('/api/templates/from-workflow/123e4567-e89b-12d3-a456-426614174000')
        .send({
          name: 'New Template',
          description: 'Template description',
          category: 'Custom'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Template created from workflow');
      expect(response.body.data).toEqual(mockTemplate);
    });

    it('should require name field', async () => {
      const response = await request(app)
        .post('/api/templates/from-workflow/123e4567-e89b-12d3-a456-426614174000')
        .send({ description: 'Missing name' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 when workflow not found', async () => {
      templateService.createTemplate = jest.fn().mockRejectedValue(
        new Error('Workflow not found or unauthorized')
      );

      const response = await request(app)
        .post('/api/templates/from-workflow/123e4567-e89b-12d3-a456-426614174000')
        .send({ name: 'Template' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/templates/initialize-builtin', () => {
    it('should initialize built-in templates', async () => {
      const mockResult = {
        message: 'Built-in templates initialized',
        count: 6
      };

      templateService.initializeBuiltInTemplates = jest.fn().mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/templates/initialize-builtin')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Built-in templates initialized');
      expect(response.body.count).toBe(6);
      expect(auth.verifyToken).toHaveBeenCalled();
    });

    it('should skip if already initialized', async () => {
      const mockResult = {
        message: 'Built-in templates already initialized',
        count: 6
      };

      templateService.initializeBuiltInTemplates = jest.fn().mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/templates/initialize-builtin')
        .expect(200);

      expect(response.body.message).toContain('already initialized');
    });
  });
});
