const templateService = require('../../src/services/templateService');
const { Workflow } = require('../../src/models');

jest.mock('../../src/models');

describe('Template Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllTemplates', () => {
    it('should return all templates when no filters provided', async () => {
      const mockTemplates = [
        {
          id: '1',
          name: 'Template 1',
          is_template: true,
          template_category: 'Data Processing',
          tags: ['api', 'database']
        },
        {
          id: '2',
          name: 'Template 2',
          is_template: true,
          template_category: 'Approval',
          tags: ['approval']
        }
      ];

      Workflow.findAll = jest.fn().mockResolvedValue(mockTemplates);

      const result = await templateService.getAllTemplates();

      expect(result).toHaveLength(2);
      expect(Workflow.findAll).toHaveBeenCalledWith({
        where: { is_template: true, status: 'active' },
        order: [['created_at', 'DESC']],
        attributes: { exclude: ['owner_id'] }
      });
    });

    it('should filter templates by category', async () => {
      const mockTemplates = [
        {
          id: '1',
          name: 'Template 1',
          template_category: 'Data Processing'
        }
      ];

      Workflow.findAll = jest.fn().mockResolvedValue(mockTemplates);

      const result = await templateService.getAllTemplates({ category: 'Data Processing' });

      expect(result).toHaveLength(1);
      expect(result[0].template_category).toBe('Data Processing');
    });

    it('should filter templates by search term', async () => {
      const mockTemplates = [
        {
          id: '1',
          name: 'Data Processing Template',
          description: 'Process data from API'
        },
        {
          id: '2',
          name: 'User Onboarding',
          description: 'Onboard new users'
        }
      ];

      Workflow.findAll = jest.fn().mockResolvedValue(mockTemplates);

      const result = await templateService.getAllTemplates({ search: 'data' });

      expect(result).toHaveLength(1);
      expect(result[0].name).toContain('Data');
    });
  });

  describe('getTemplateById', () => {
    it('should return template when found', async () => {
      const mockTemplate = {
        id: '1',
        name: 'Template 1',
        is_template: true
      };

      Workflow.findOne = jest.fn().mockResolvedValue(mockTemplate);

      const result = await templateService.getTemplateById('1');

      expect(result).toEqual(mockTemplate);
      expect(Workflow.findOne).toHaveBeenCalledWith({
        where: { id: '1', is_template: true }
      });
    });

    it('should throw error when template not found', async () => {
      Workflow.findOne = jest.fn().mockResolvedValue(null);

      await expect(templateService.getTemplateById('999')).rejects.toThrow('Template not found');
    });
  });

  describe('instantiateTemplate', () => {
    it('should create workflow from template', async () => {
      const mockTemplate = {
        id: '1',
        name: 'Template 1',
        description: 'Test template',
        definition: { steps: [] },
        variables: {},
        category: 'Data Processing',
        tags: ['api']
      };

      const mockWorkflow = {
        id: '2',
        name: 'Template 1 (Copy)',
        is_template: false
      };

      Workflow.findOne = jest.fn().mockResolvedValue(mockTemplate);
      Workflow.create = jest.fn().mockResolvedValue(mockWorkflow);

      const result = await templateService.instantiateTemplate(
        '1',
        'user-123',
        { name: 'My Workflow' }
      );

      expect(result.name).toBe('Template 1 (Copy)');
      expect(Workflow.create).toHaveBeenCalled();
      expect(Workflow.create.mock.calls[0][0]).toMatchObject({
        is_template: false,
        status: 'draft',
        owner_id: 'user-123'
      });
    });

    it('should apply customizations when provided', async () => {
      const mockTemplate = {
        id: '1',
        name: 'Template 1',
        definition: { steps: [] }
      };

      Workflow.findOne = jest.fn().mockResolvedValue(mockTemplate);
      Workflow.create = jest.fn().mockResolvedValue({});

      await templateService.instantiateTemplate('1', 'user-123', {
        name: 'Custom Name',
        description: 'Custom description',
        trigger_type: 'scheduled'
      });

      expect(Workflow.create.mock.calls[0][0]).toMatchObject({
        name: 'Custom Name',
        description: 'Custom description',
        trigger_type: 'scheduled'
      });
    });
  });

  describe('createTemplate', () => {
    it('should create template from workflow', async () => {
      const mockWorkflow = {
        id: '1',
        name: 'My Workflow',
        description: 'Test',
        definition: { steps: [] },
        owner_id: 'user-123'
      };

      const mockTemplate = {
        id: '2',
        name: 'My Workflow Template',
        is_template: true
      };

      Workflow.findOne = jest.fn().mockResolvedValue(mockWorkflow);
      Workflow.create = jest.fn().mockResolvedValue(mockTemplate);

      const result = await templateService.createTemplate(
        '1',
        'user-123',
        { name: 'New Template', category: 'Custom' }
      );

      expect(result.is_template).toBe(true);
      expect(Workflow.create).toHaveBeenCalled();
      expect(Workflow.create.mock.calls[0][0]).toMatchObject({
        is_template: true,
        status: 'active',
        template_category: 'Custom'
      });
    });

    it('should throw error when workflow not found', async () => {
      Workflow.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        templateService.createTemplate('999', 'user-123', { name: 'Template' })
      ).rejects.toThrow('Workflow not found or unauthorized');
    });

    it('should throw error when user unauthorized', async () => {
      const mockWorkflow = {
        id: '1',
        owner_id: 'user-456'
      };

      Workflow.findOne = jest.fn().mockResolvedValue(mockWorkflow);

      await expect(
        templateService.createTemplate('1', 'user-123', { name: 'Template' })
      ).rejects.toThrow('Workflow not found or unauthorized');
    });
  });

  describe('initializeBuiltInTemplates', () => {
    it('should skip initialization if templates already exist', async () => {
      Workflow.count = jest.fn().mockResolvedValue(5);

      const result = await templateService.initializeBuiltInTemplates('admin-123');

      expect(result.message).toContain('already initialized');
      expect(result.count).toBe(5);
      expect(Workflow.create).not.toHaveBeenCalled();
    });

    it('should create built-in templates when none exist', async () => {
      Workflow.count = jest.fn().mockResolvedValue(0);
      Workflow.create = jest.fn().mockResolvedValue({});

      const result = await templateService.initializeBuiltInTemplates('admin-123');

      expect(result.message).toContain('initialized');
      expect(Workflow.create).toHaveBeenCalled();
      expect(Workflow.create.mock.calls.length).toBeGreaterThan(0);
    });
  });
});
