const { Workflow } = require('../models');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

/**
 * Predefined workflow templates
 */
const BUILTIN_TEMPLATES = [
  {
    name: 'Data Processing Pipeline',
    description: 'Extract data from API, transform it, and store in database',
    category: 'Data Processing',
    tags: ['api', 'database', 'etl'],
    definition: {
      steps: [
        {
          step_id: 'fetch_data',
          name: 'Fetch Data from API',
          type: 'api_call',
          config: {
            method: 'GET',
            url: 'https://api.example.com/data',
            headers: { 'Content-Type': 'application/json' }
          },
          position: { x: 100, y: 100 }
        },
        {
          step_id: 'transform',
          name: 'Transform Data',
          type: 'javascript',
          config: {
            code: `// Transform the data
const transformed = context.fetch_data.map(item => ({
  id: item.id,
  value: item.value * 2
}));
return { transformed };`
          },
          position: { x: 100, y: 200 }
        },
        {
          step_id: 'save_to_db',
          name: 'Save to Database',
          type: 'action',
          config: {
            service: 'database',
            operation: 'insert',
            table: 'processed_data',
            data: '{{transform.transformed}}'
          },
          position: { x: 100, y: 300 }
        }
      ],
      connections: [
        { from: 'fetch_data', to: 'transform' },
        { from: 'transform', to: 'save_to_db' }
      ]
    }
  },
  {
    name: 'User Onboarding Flow',
    description: 'Send welcome email, create profile, and notify team',
    category: 'User Management',
    tags: ['onboarding', 'email', 'notifications'],
    definition: {
      steps: [
        {
          step_id: 'send_welcome',
          name: 'Send Welcome Email',
          type: 'notification',
          config: {
            type: 'email',
            recipients: '{{input.userEmail}}',
            subject: 'Welcome to Our Platform!',
            message: 'Thank you for signing up. We\'re excited to have you!'
          },
          position: { x: 100, y: 100 }
        },
        {
          step_id: 'create_profile',
          name: 'Create User Profile',
          type: 'action',
          config: {
            service: 'user-service',
            operation: 'createProfile',
            userId: '{{input.userId}}',
            data: '{{input.profileData}}'
          },
          position: { x: 100, y: 200 }
        },
        {
          step_id: 'notify_team',
          name: 'Notify Team',
          type: 'notification',
          config: {
            type: 'slack',
            channel: '#new-users',
            message: 'New user signed up: {{input.userEmail}}'
          },
          position: { x: 100, y: 300 }
        }
      ],
      connections: [
        { from: 'send_welcome', to: 'create_profile' },
        { from: 'create_profile', to: 'notify_team' }
      ]
    }
  },
  {
    name: 'Content Approval Workflow',
    description: 'Submit content for review, approval, and publication',
    category: 'Approval',
    tags: ['approval', 'content', 'moderation'],
    definition: {
      steps: [
        {
          step_id: 'validate_content',
          name: 'Validate Content',
          type: 'condition',
          config: {
            expression: 'input.content.length > 10 && input.content.length < 5000'
          },
          position: { x: 100, y: 100 }
        },
        {
          step_id: 'request_approval',
          name: 'Request Manager Approval',
          type: 'approval',
          config: {
            approvers: ['manager@example.com'],
            title: 'Content Approval Required',
            description: 'Please review and approve: {{input.title}}',
            timeoutMinutes: 1440
          },
          position: { x: 100, y: 200 }
        },
        {
          step_id: 'publish',
          name: 'Publish Content',
          type: 'action',
          config: {
            service: 'content-service',
            operation: 'publish',
            contentId: '{{input.contentId}}'
          },
          position: { x: 100, y: 300 }
        },
        {
          step_id: 'notify_rejection',
          name: 'Notify Rejection',
          type: 'notification',
          config: {
            type: 'email',
            recipients: '{{input.authorEmail}}',
            subject: 'Content Rejected',
            message: 'Your content was not approved.'
          },
          position: { x: 300, y: 200 }
        }
      ],
      connections: [
        { from: 'validate_content', to: 'request_approval', condition: 'true' },
        { from: 'validate_content', to: 'notify_rejection', condition: 'false' },
        { from: 'request_approval', to: 'publish' }
      ]
    }
  },
  {
    name: 'Scheduled Report Generation',
    description: 'Generate reports, export to PDF, and email to stakeholders',
    category: 'Reporting',
    tags: ['reporting', 'scheduled', 'email'],
    definition: {
      steps: [
        {
          step_id: 'fetch_data',
          name: 'Fetch Report Data',
          type: 'api_call',
          config: {
            method: 'GET',
            url: 'https://api.example.com/analytics',
            params: {
              startDate: '{{input.startDate}}',
              endDate: '{{input.endDate}}'
            }
          },
          position: { x: 100, y: 100 }
        },
        {
          step_id: 'generate_report',
          name: 'Generate Report',
          type: 'javascript',
          config: {
            code: `// Generate report HTML
const html = \`<h1>Analytics Report</h1>
<p>Period: \${context.input.startDate} to \${context.input.endDate}</p>
<table>
  \${context.fetch_data.map(row => \`<tr><td>\${row.metric}</td><td>\${row.value}</td></tr>\`).join('')}
</table>\`;
return { html };`
          },
          position: { x: 100, y: 200 }
        },
        {
          step_id: 'send_report',
          name: 'Email Report',
          type: 'notification',
          config: {
            type: 'email',
            recipients: '{{input.recipients}}',
            subject: 'Weekly Analytics Report',
            message: '{{generate_report.html}}',
            isHtml: true
          },
          position: { x: 100, y: 300 }
        }
      ],
      connections: [
        { from: 'fetch_data', to: 'generate_report' },
        { from: 'generate_report', to: 'send_report' }
      ]
    }
  },
  {
    name: 'Error Handling Pattern',
    description: 'Demonstrates retry logic and error notification',
    category: 'Patterns',
    tags: ['error-handling', 'retry', 'patterns'],
    definition: {
      steps: [
        {
          step_id: 'risky_operation',
          name: 'API Call with Retry',
          type: 'api_call',
          config: {
            method: 'POST',
            url: 'https://api.example.com/operation',
            retry: { maxAttempts: 3, delayMs: 1000 }
          },
          position: { x: 100, y: 100 }
        },
        {
          step_id: 'check_result',
          name: 'Check Operation Result',
          type: 'condition',
          config: {
            expression: 'risky_operation.status === "success"'
          },
          position: { x: 100, y: 200 }
        },
        {
          step_id: 'success_action',
          name: 'Handle Success',
          type: 'action',
          config: {
            service: 'logger',
            operation: 'log',
            level: 'info',
            message: 'Operation succeeded'
          },
          position: { x: 100, y: 300 }
        },
        {
          step_id: 'error_notification',
          name: 'Notify on Error',
          type: 'notification',
          config: {
            type: 'email',
            recipients: 'admin@example.com',
            subject: 'Workflow Error Alert',
            message: 'Operation failed after retries: {{risky_operation.error}}'
          },
          position: { x: 300, y: 300 }
        }
      ],
      connections: [
        { from: 'risky_operation', to: 'check_result' },
        { from: 'check_result', to: 'success_action', condition: 'true' },
        { from: 'check_result', to: 'error_notification', condition: 'false' }
      ]
    }
  },
  {
    name: 'Parallel Processing',
    description: 'Process multiple tasks in parallel for efficiency',
    category: 'Patterns',
    tags: ['parallel', 'performance', 'patterns'],
    definition: {
      steps: [
        {
          step_id: 'parallel_tasks',
          name: 'Process Tasks in Parallel',
          type: 'parallel',
          config: {
            branches: [
              { name: 'Task A', steps: ['task_a'] },
              { name: 'Task B', steps: ['task_b'] },
              { name: 'Task C', steps: ['task_c'] }
            ]
          },
          position: { x: 100, y: 100 }
        },
        {
          step_id: 'task_a',
          name: 'Task A: Fetch User Data',
          type: 'api_call',
          config: {
            method: 'GET',
            url: 'https://api.example.com/users'
          },
          position: { x: 50, y: 200 }
        },
        {
          step_id: 'task_b',
          name: 'Task B: Fetch Product Data',
          type: 'api_call',
          config: {
            method: 'GET',
            url: 'https://api.example.com/products'
          },
          position: { x: 200, y: 200 }
        },
        {
          step_id: 'task_c',
          name: 'Task C: Fetch Order Data',
          type: 'api_call',
          config: {
            method: 'GET',
            url: 'https://api.example.com/orders'
          },
          position: { x: 350, y: 200 }
        },
        {
          step_id: 'combine_results',
          name: 'Combine Results',
          type: 'javascript',
          config: {
            code: `return {
  combined: {
    users: context.task_a,
    products: context.task_b,
    orders: context.task_c
  }
};`
          },
          position: { x: 200, y: 350 }
        }
      ],
      connections: [
        { from: 'parallel_tasks', to: 'combine_results' }
      ]
    }
  }
];

class TemplateService {
  /**
   * Get all available templates
   */
  async getAllTemplates(options = {}) {
    const { category, tags, search } = options;

    const where = { is_template: true, status: 'active' };

    if (category) {
      where.template_category = category;
    }

    if (tags && tags.length > 0) {
      where.tags = { [Op.overlap]: tags };
    }

    const templates = await Workflow.findAll({
      where,
      order: [['created_at', 'DESC']],
      attributes: { exclude: ['owner_id'] }
    });

    // Filter by search term if provided
    let results = templates;
    if (search) {
      const searchLower = search.toLowerCase();
      results = templates.filter(t =>
        t.name.toLowerCase().includes(searchLower) ||
        t.description?.toLowerCase().includes(searchLower)
      );
    }

    return results;
  }

  /**
   * Get template categories with counts
   */
  async getCategories() {
    const templates = await Workflow.findAll({
      where: { is_template: true, status: 'active' },
      attributes: ['template_category'],
      group: ['template_category']
    });

    const categories = {};
    for (const t of templates) {
      const category = t.template_category || 'Uncategorized';
      categories[category] = (categories[category] || 0) + 1;
    }

    return categories;
  }

  /**
   * Get template by ID
   */
  async getTemplateById(id) {
    const template = await Workflow.findOne({
      where: { id, is_template: true }
    });

    if (!template) {
      throw new Error('Template not found');
    }

    return template;
  }

  /**
   * Create workflow from template
   */
  async instantiateTemplate(templateId, userId, customizations = {}) {
    const template = await this.getTemplateById(templateId);

    const workflow = await Workflow.create({
      name: customizations.name || `${template.name} (Copy)`,
      description: customizations.description || template.description,
      definition: template.definition,
      variables: template.variables,
      jsonlex_schema: template.jsonlex_schema,
      trigger_type: customizations.trigger_type || 'manual',
      trigger_config: customizations.trigger_config || null,
      category: customizations.category || template.category,
      tags: customizations.tags || template.tags,
      owner_id: userId,
      is_template: false,
      status: 'draft',
      settings: template.settings
    });

    return workflow;
  }

  /**
   * Create new template from existing workflow
   */
  async createTemplate(workflowId, userId, templateData) {
    const workflow = await Workflow.findOne({
      where: { id: workflowId, owner_id: userId }
    });

    if (!workflow) {
      throw new Error('Workflow not found or unauthorized');
    }

    const template = await Workflow.create({
      name: templateData.name || `${workflow.name} Template`,
      description: templateData.description || workflow.description,
      definition: workflow.definition,
      variables: workflow.variables,
      jsonlex_schema: workflow.jsonlex_schema,
      category: workflow.category,
      tags: workflow.tags,
      template_category: templateData.category || 'Custom',
      owner_id: userId,
      is_template: true,
      status: 'active',
      settings: workflow.settings
    });

    return template;
  }

  /**
   * Initialize built-in templates (run on setup)
   */
  async initializeBuiltInTemplates(adminUserId) {
    const existingCount = await Workflow.count({
      where: { is_template: true, template_category: { [Op.in]: BUILTIN_TEMPLATES.map(t => t.category) } }
    });

    if (existingCount > 0) {
      return { message: 'Built-in templates already initialized', count: existingCount };
    }

    const created = [];
    for (const template of BUILTIN_TEMPLATES) {
      const workflow = await Workflow.create({
        ...template,
        owner_id: adminUserId,
        is_template: true,
        template_category: template.category,
        status: 'active'
      });
      created.push(workflow);
    }

    return { message: 'Built-in templates initialized', count: created.length, templates: created };
  }
}

module.exports = new TemplateService();
