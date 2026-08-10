/**
 * Exprsn Herald - Template Service
 * Manages notification templates
 */

const { NotificationTemplate } = require('../models');
const Handlebars = require('handlebars');
const logger = require('../utils/logger');

class TemplateService {
  /**
   * Get template by name and channel
   */
  async getTemplate(name, channel) {
    try {
      const template = await NotificationTemplate.findOne({
        where: {
          name,
          channel,
          active: true
        }
      });

      if (!template) {
        logger.warn('Template not found', { name, channel });
        return null;
      }

      return template;
    } catch (error) {
      logger.error('Error getting template', {
        error: error.message,
        name,
        channel
      });
      throw error;
    }
  }

  /**
   * Get template by ID
   */
  async getTemplateById(id) {
    try {
      const template = await NotificationTemplate.findByPk(id);
      return template;
    } catch (error) {
      logger.error('Error getting template by ID', {
        error: error.message,
        id
      });
      throw error;
    }
  }

  /**
   * Create new template
   */
  async createTemplate({ name, channel, subject, body, variables = [], active = true }) {
    try {
      // Validate required fields
      if (!name || !channel || !body) {
        throw new Error('name, channel, and body are required');
      }

      // Check if template with same name already exists
      const existing = await NotificationTemplate.findOne({ where: { name } });
      if (existing) {
        throw new Error('Template with this name already exists');
      }

      const template = await NotificationTemplate.create({
        name,
        channel,
        subject,
        body,
        variables,
        active
      });

      logger.info('Template created', { templateId: template.id, name });
      return template;
    } catch (error) {
      logger.error('Error creating template', {
        error: error.message,
        name
      });
      throw error;
    }
  }

  /**
   * Update template
   */
  async updateTemplate(id, data) {
    try {
      const template = await NotificationTemplate.findByPk(id);
      if (!template) {
        throw new Error('Template not found');
      }

      // If name is being changed, check for conflicts
      if (data.name && data.name !== template.name) {
        const existing = await NotificationTemplate.findOne({
          where: { name: data.name }
        });
        if (existing) {
          throw new Error('Template with this name already exists');
        }
      }

      await template.update(data);

      logger.info('Template updated', { templateId: id });
      return template;
    } catch (error) {
      logger.error('Error updating template', {
        error: error.message,
        id
      });
      throw error;
    }
  }

  /**
   * Delete template (soft delete by setting active=false)
   */
  async deleteTemplate(id) {
    try {
      const template = await NotificationTemplate.findByPk(id);
      if (!template) {
        throw new Error('Template not found');
      }

      await template.update({ active: false });

      logger.info('Template deleted (deactivated)', { templateId: id });
      return { success: true };
    } catch (error) {
      logger.error('Error deleting template', {
        error: error.message,
        id
      });
      throw error;
    }
  }

  /**
   * List templates with filters
   */
  async listTemplates({ channel = null, active = null, limit = 50, offset = 0 } = {}) {
    try {
      const where = {};

      if (channel) {
        where.channel = channel;
      }

      if (active !== null) {
        where.active = active;
      }

      const { rows: templates, count } = await NotificationTemplate.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['name', 'ASC']]
      });

      return {
        templates,
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('Error listing templates', { error: error.message });
      throw error;
    }
  }

  /**
   * Render template with variables
   */
  renderTemplate(templateBody, variables) {
    try {
      const template = Handlebars.compile(templateBody);
      return template(variables);
    } catch (error) {
      logger.error('Error rendering template', {
        error: error.message,
        variables
      });
      throw error;
    }
  }

  /**
   * Extract variables from template
   */
  extractVariables(templateBody) {
    try {
      // Match {{variable}} patterns
      const regex = /\{\{(\w+)\}\}/g;
      const variables = [];
      let match;

      while ((match = regex.exec(templateBody)) !== null) {
        if (!variables.includes(match[1])) {
          variables.push(match[1]);
        }
      }

      return variables;
    } catch (error) {
      logger.error('Error extracting variables', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Validate template variables
   */
  validateTemplateVariables(templateBody, providedVariables) {
    const requiredVariables = this.extractVariables(templateBody);
    const missing = requiredVariables.filter(v => !(v in providedVariables));

    return {
      valid: missing.length === 0,
      required: requiredVariables,
      missing
    };
  }

  /**
   * Duplicate template (create copy with new name)
   */
  async duplicateTemplate(id, newName) {
    try {
      const original = await NotificationTemplate.findByPk(id);
      if (!original) {
        throw new Error('Template not found');
      }

      // Check if new name already exists
      const existing = await NotificationTemplate.findOne({
        where: { name: newName }
      });
      if (existing) {
        throw new Error('Template with this name already exists');
      }

      const duplicate = await NotificationTemplate.create({
        name: newName,
        channel: original.channel,
        subject: original.subject,
        body: original.body,
        variables: original.variables,
        active: true
      });

      logger.info('Template duplicated', {
        originalId: id,
        duplicateId: duplicate.id
      });

      return duplicate;
    } catch (error) {
      logger.error('Error duplicating template', {
        error: error.message,
        id,
        newName
      });
      throw error;
    }
  }
}

module.exports = new TemplateService();
