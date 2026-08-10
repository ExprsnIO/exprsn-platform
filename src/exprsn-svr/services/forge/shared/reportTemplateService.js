/**
 * Report Template Service
 * Manages reusable report templates with variable substitution
 */

const { v4: uuidv4 } = require('uuid');
const reportVariableService = require('./reportVariableService');
const logger = require('../../../utils/logger');

class ReportTemplateService {
  constructor() {
    // Built-in report templates
    this.builtInTemplates = {
      // CRM Templates
      'crm-monthly-sales': {
        id: 'crm-monthly-sales',
        name: 'Monthly Sales Report',
        description: 'Comprehensive sales performance for {{month}} {{year}}',
        category: 'crm',
        module: 'crm',
        reportType: 'opportunities_forecast',
        isBuiltIn: true,
        config: {
          parameters: {
            date_range: {
              startDate: '@THIS_MONTH_START',
              endDate: '@THIS_MONTH_END'
            },
            stage: 'all',
            forecast_period: 'monthly'
          },
          visualization: {
            type: 'chart',
            chartType: 'bar',
            xAxis: 'stage',
            yAxis: 'totalValue'
          }
        },
        variables: {
          month: {
            name: 'month',
            label: 'Month',
            type: 'text',
            defaultValue: '@CURRENT_MONTH',
            required: false
          },
          year: {
            name: 'year',
            label: 'Year',
            type: 'number',
            defaultValue: '@CURRENT_YEAR',
            required: false
          }
        }
      },

      'crm-lead-conversion': {
        id: 'crm-lead-conversion',
        name: 'Lead Conversion Analysis',
        description: 'Lead conversion metrics from {{start_date}} to {{end_date}}',
        category: 'crm',
        module: 'crm',
        reportType: 'leads_pipeline',
        isBuiltIn: true,
        config: {
          parameters: {
            date_range: {
              startDate: '@THIS_QUARTER_START',
              endDate: '@THIS_QUARTER_END'
            },
            status: 'all'
          },
          metrics: ['conversion_rate', 'time_to_convert', 'source_performance']
        }
      },

      // ERP Templates
      'erp-monthly-pl': {
        id: 'erp-monthly-pl',
        name: 'Monthly P&L Statement',
        description: 'Profit & Loss statement for {{month}} {{year}}',
        category: 'erp',
        module: 'erp',
        reportType: 'profit_loss',
        isBuiltIn: true,
        config: {
          parameters: {
            start_date: '@THIS_MONTH_START',
            end_date: '@THIS_MONTH_END',
            comparison_period: 'previous_month'
          }
        }
      },

      'erp-quarterly-cashflow': {
        id: 'erp-quarterly-cashflow',
        name: 'Quarterly Cash Flow',
        description: 'Cash flow statement for Q{{quarter}} {{year}}',
        category: 'erp',
        module: 'erp',
        reportType: 'cash_flow',
        isBuiltIn: true,
        config: {
          parameters: {
            start_date: '@THIS_QUARTER_START',
            end_date: '@THIS_QUARTER_END'
          }
        }
      },

      'erp-inventory-valuation': {
        id: 'erp-inventory-valuation',
        name: 'Inventory Valuation Report',
        description: 'Current inventory valuation as of {{as_of_date}}',
        category: 'erp',
        module: 'erp',
        reportType: 'inventory_valuation',
        isBuiltIn: true,
        config: {
          parameters: {
            as_of_date: '@TODAY',
            valuation_method: 'fifo'
          }
        }
      },

      // Groupware Templates
      'groupware-weekly-tasks': {
        id: 'groupware-weekly-tasks',
        name: 'Weekly Task Summary',
        description: 'Task completion summary for week of {{week_start}}',
        category: 'groupware',
        module: 'groupware',
        reportType: 'tasks_summary',
        isBuiltIn: true,
        config: {
          parameters: {
            date_range: {
              startDate: '@THIS_WEEK_START',
              endDate: '@THIS_WEEK_END'
            },
            include_subtasks: true
          }
        }
      },

      'groupware-monthly-time': {
        id: 'groupware-monthly-time',
        name: 'Monthly Time Tracking',
        description: 'Time tracking report for {{month}} {{year}}',
        category: 'groupware',
        module: 'groupware',
        reportType: 'time_tracking',
        isBuiltIn: true,
        config: {
          parameters: {
            date_range: {
              startDate: '@THIS_MONTH_START',
              endDate: '@THIS_MONTH_END'
            },
            group_by: 'user'
          }
        }
      },

      'groupware-project-status': {
        id: 'groupware-project-status',
        name: 'Active Projects Status',
        description: 'Status of all active projects',
        category: 'groupware',
        module: 'groupware',
        reportType: 'project_status',
        isBuiltIn: true,
        config: {
          parameters: {
            status: 'active'
          }
        }
      }
    };

    // Template storage (in production, this would be a database)
    this.customTemplates = new Map();
  }

  /**
   * Get all available templates
   */
  getAvailableTemplates(filters = {}) {
    const { category, module, isBuiltIn, userId } = filters;

    let templates = [
      ...Object.values(this.builtInTemplates),
      ...Array.from(this.customTemplates.values())
    ];

    // Apply filters
    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    if (module) {
      templates = templates.filter(t => t.module === module);
    }

    if (isBuiltIn !== undefined) {
      templates = templates.filter(t => t.isBuiltIn === isBuiltIn);
    }

    if (userId) {
      templates = templates.filter(t => t.isBuiltIn || t.createdBy === userId || t.sharedWith?.includes(userId));
    }

    return templates;
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId) {
    // Check built-in templates
    if (this.builtInTemplates[templateId]) {
      return { ...this.builtInTemplates[templateId] };
    }

    // Check custom templates
    if (this.customTemplates.has(templateId)) {
      return { ...this.customTemplates.get(templateId) };
    }

    throw new Error(`Template not found: ${templateId}`);
  }

  /**
   * Create custom template
   */
  async createTemplate(templateData, userId) {
    const template = {
      id: uuidv4(),
      name: templateData.name,
      description: templateData.description || '',
      category: templateData.category,
      module: templateData.module,
      reportType: templateData.reportType,
      isBuiltIn: false,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config: templateData.config || {},
      variables: templateData.variables || {},
      tags: templateData.tags || [],
      sharedWith: templateData.sharedWith || [],
      version: 1
    };

    // Validate template
    const validation = this.validateTemplate(template);
    if (!validation.valid) {
      throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    this.customTemplates.set(template.id, template);

    logger.info('Created custom report template', { templateId: template.id, userId });

    return template;
  }

  /**
   * Update template
   */
  async updateTemplate(templateId, updates, userId) {
    const template = this.customTemplates.get(templateId);

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    if (template.isBuiltIn) {
      throw new Error('Cannot modify built-in templates');
    }

    if (template.createdBy !== userId) {
      throw new Error('Unauthorized to modify this template');
    }

    // Update fields
    const updatedTemplate = {
      ...template,
      ...updates,
      id: template.id, // Preserve ID
      isBuiltIn: false, // Preserve built-in flag
      createdBy: template.createdBy, // Preserve creator
      createdAt: template.createdAt, // Preserve creation date
      updatedAt: new Date().toISOString(),
      version: template.version + 1
    };

    // Validate updated template
    const validation = this.validateTemplate(updatedTemplate);
    if (!validation.valid) {
      throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    this.customTemplates.set(templateId, updatedTemplate);

    logger.info('Updated report template', { templateId, userId, version: updatedTemplate.version });

    return updatedTemplate;
  }

  /**
   * Delete template
   */
  async deleteTemplate(templateId, userId) {
    const template = this.customTemplates.get(templateId);

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    if (template.isBuiltIn) {
      throw new Error('Cannot delete built-in templates');
    }

    if (template.createdBy !== userId) {
      throw new Error('Unauthorized to delete this template');
    }

    this.customTemplates.delete(templateId);

    logger.info('Deleted report template', { templateId, userId });

    return { success: true };
  }

  /**
   * Clone template
   */
  async cloneTemplate(templateId, userId, options = {}) {
    const sourceTemplate = this.getTemplate(templateId);

    const clonedTemplate = {
      ...sourceTemplate,
      id: uuidv4(),
      name: options.name || `${sourceTemplate.name} (Copy)`,
      description: options.description || sourceTemplate.description,
      isBuiltIn: false,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      clonedFrom: templateId
    };

    this.customTemplates.set(clonedTemplate.id, clonedTemplate);

    logger.info('Cloned report template', { sourceId: templateId, newId: clonedTemplate.id, userId });

    return clonedTemplate;
  }

  /**
   * Apply template to create report instance
   */
  async applyTemplate(templateId, parameters = {}, context = {}) {
    const template = this.getTemplate(templateId);

    // Resolve template variables
    const resolvedVariables = this.resolveTemplateVariables(template, parameters, context);

    // Substitute variables in config
    const resolvedConfig = this.substituteVariables(template.config, resolvedVariables);

    // Substitute variables in description
    const resolvedDescription = reportVariableService.substituteInText(
      template.description,
      resolvedVariables
    );

    return {
      name: template.name,
      description: resolvedDescription,
      reportType: template.reportType,
      module: template.module,
      config: resolvedConfig,
      appliedFrom: templateId,
      appliedAt: new Date().toISOString()
    };
  }

  /**
   * Resolve template variables
   */
  resolveTemplateVariables(template, userParameters, context) {
    const resolved = {};

    // First, resolve template-defined variables
    if (template.variables) {
      for (const [name, variable] of Object.entries(template.variables)) {
        if (userParameters[name] !== undefined) {
          resolved[name] = userParameters[name];
        } else if (variable.defaultValue) {
          // Handle dynamic variable references
          if (typeof variable.defaultValue === 'string' && variable.defaultValue.startsWith('@')) {
            const dynamicVar = variable.defaultValue.substring(1);
            const dynamicFn = reportVariableService.dynamicVariables[dynamicVar];
            if (dynamicFn) {
              resolved[name] = dynamicFn(context);
            } else {
              resolved[name] = variable.defaultValue;
            }
          } else {
            resolved[name] = variable.defaultValue;
          }
        }
      }
    }

    // Add user-provided parameters not in template variables
    for (const [name, value] of Object.entries(userParameters)) {
      if (!(name in resolved)) {
        resolved[name] = value;
      }
    }

    // Add context variables
    if (context.userId) {
      resolved.userId = context.userId;
    }

    return resolved;
  }

  /**
   * Substitute variables in configuration object
   */
  substituteVariables(obj, variables) {
    if (typeof obj === 'string') {
      return reportVariableService.substituteInText(obj, variables);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.substituteVariables(item, variables));
    }

    if (typeof obj === 'object' && obj !== null) {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteVariables(value, variables);
      }
      return result;
    }

    return obj;
  }

  /**
   * Validate template
   */
  validateTemplate(template) {
    const errors = [];

    // Required fields
    if (!template.name || template.name.trim() === '') {
      errors.push('Template name is required');
    }

    if (!template.module) {
      errors.push('Module is required');
    }

    if (!template.reportType) {
      errors.push('Report type is required');
    }

    if (!template.category) {
      errors.push('Category is required');
    }

    // Validate module value
    const validModules = ['crm', 'erp', 'groupware', 'custom'];
    if (template.module && !validModules.includes(template.module)) {
      errors.push(`Invalid module: ${template.module}`);
    }

    // Validate config structure
    if (template.config && typeof template.config !== 'object') {
      errors.push('Config must be an object');
    }

    // Validate variables
    if (template.variables) {
      if (typeof template.variables !== 'object') {
        errors.push('Variables must be an object');
      } else {
        for (const [name, variable] of Object.entries(template.variables)) {
          if (!variable.name || !variable.type) {
            errors.push(`Variable ${name} must have name and type`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Share template with users
   */
  async shareTemplate(templateId, userIds, userId) {
    const template = this.customTemplates.get(templateId);

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    if (template.createdBy !== userId) {
      throw new Error('Only template owner can share');
    }

    template.sharedWith = [...new Set([...(template.sharedWith || []), ...userIds])];
    template.updatedAt = new Date().toISOString();

    this.customTemplates.set(templateId, template);

    logger.info('Shared report template', { templateId, sharedWith: userIds, userId });

    return template;
  }

  /**
   * Unshare template from users
   */
  async unshareTemplate(templateId, userIds, userId) {
    const template = this.customTemplates.get(templateId);

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    if (template.createdBy !== userId) {
      throw new Error('Only template owner can unshare');
    }

    template.sharedWith = (template.sharedWith || []).filter(id => !userIds.includes(id));
    template.updatedAt = new Date().toISOString();

    this.customTemplates.set(templateId, template);

    logger.info('Unshared report template', { templateId, unsharedFrom: userIds, userId });

    return template;
  }

  /**
   * Get template usage statistics
   */
  getTemplateStats(templateId) {
    // In production, this would query the database for actual usage
    return {
      templateId,
      timesUsed: 0,
      lastUsed: null,
      averageExecutionTime: null
    };
  }

  /**
   * Export template as JSON
   */
  exportTemplate(templateId) {
    const template = this.getTemplate(templateId);

    // Remove internal fields
    const exported = {
      ...template,
      id: undefined,
      createdBy: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      sharedWith: undefined
    };

    return JSON.stringify(exported, null, 2);
  }

  /**
   * Import template from JSON
   */
  async importTemplate(templateJson, userId) {
    try {
      const templateData = typeof templateJson === 'string'
        ? JSON.parse(templateJson)
        : templateJson;

      // Create new template from imported data
      return await this.createTemplate(templateData, userId);
    } catch (err) {
      logger.error('Failed to import template', { error: err.message });
      throw new Error(`Template import failed: ${err.message}`);
    }
  }

  /**
   * Search templates
   */
  searchTemplates(query, filters = {}) {
    const searchTerm = query.toLowerCase();
    let templates = this.getAvailableTemplates(filters);

    templates = templates.filter(template => {
      return (
        template.name.toLowerCase().includes(searchTerm) ||
        template.description.toLowerCase().includes(searchTerm) ||
        template.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    });

    return templates;
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory() {
    const templates = this.getAvailableTemplates();
    const byCategory = {};

    for (const template of templates) {
      if (!byCategory[template.category]) {
        byCategory[template.category] = [];
      }
      byCategory[template.category].push(template);
    }

    return byCategory;
  }

  /**
   * Get templates by module
   */
  getTemplatesByModule() {
    const templates = this.getAvailableTemplates();
    const byModule = {};

    for (const template of templates) {
      if (!byModule[template.module]) {
        byModule[template.module] = [];
      }
      byModule[template.module].push(template);
    }

    return byModule;
  }
}

module.exports = new ReportTemplateService();
