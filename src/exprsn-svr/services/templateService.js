/**
 * ═══════════════════════════════════════════════════════════
 * Template Service
 * Business logic for template management and page creation
 * ═══════════════════════════════════════════════════════════
 */

const Template = require('../models/Template');
const pageService = require('./pageService');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class TemplateService {
  /**
   * Create a new template
   */
  async createTemplate(data, userId) {
    try {
      const template = await Template.create({
        created_by: userId,
        name: data.name,
        slug: data.slug,
        category: data.category || 'other',
        description: data.description,
        thumbnail_url: data.thumbnailUrl,
        html_template: data.htmlTemplate,
        css_template: data.cssTemplate,
        javascript_template: data.javascriptTemplate,
        server_code_template: data.serverCodeTemplate,
        customization_schema: data.customizationSchema || {},
        default_data: data.defaultData || {},
        required_components: data.requiredComponents || [],
        tags: data.tags || [],
        is_public: data.isPublic !== undefined ? data.isPublic : false
      });

      logger.info('Template created', {
        templateId: template.id,
        name: template.name,
        userId
      });

      return template;
    } catch (error) {
      logger.error('Failed to create template', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Get template by ID or slug
   */
  async getTemplate(identifier, userId = null) {
    try {
      const where = identifier.match(/^[0-9a-f-]{36}$/)
        ? { id: identifier }
        : { slug: identifier };

      const template = await Template.findOne({ where });

      if (!template) {
        throw new AppError('Template not found', 404);
      }

      // Check access for private templates
      if (!template.is_public && userId && !template.canAccess(userId)) {
        throw new AppError('Access denied', 403);
      }

      return template;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to get template', { error: error.message, identifier });
      throw error;
    }
  }

  /**
   * List templates with filters
   */
  async listTemplates(filters = {}) {
    try {
      const where = {};

      if (filters.category) {
        where.category = filters.category;
      }

      if (filters.isPublic !== undefined) {
        where.is_public = filters.isPublic;
      }

      if (filters.isFeatured !== undefined) {
        where.is_featured = filters.isFeatured;
      }

      if (filters.createdBy) {
        where.created_by = filters.createdBy;
      }

      if (filters.tags && filters.tags.length > 0) {
        where.tags = {
          [require('sequelize').Op.overlap]: filters.tags
        };
      }

      const orderBy = filters.orderBy || 'uses_count';
      const orderDirection = filters.orderDirection || 'DESC';

      const templates = await Template.findAll({
        where,
        order: [[orderBy, orderDirection]],
        limit: filters.limit || 50,
        offset: filters.offset || 0
      });

      return templates.map(t => t.toPreviewJSON());
    } catch (error) {
      logger.error('Failed to list templates', { error: error.message });
      throw error;
    }
  }

  /**
   * Create page from template
   */
  async createPageFromTemplate(templateId, pageData, userId) {
    try {
      const template = await this.getTemplate(templateId, userId);

      // Apply customizations to template
      const customizedHtml = this.applyCustomizations(
        template.html_template,
        pageData.customizations || {},
        template.default_data
      );

      const customizedCss = this.applyCustomizations(
        template.css_template,
        pageData.customizations || {},
        template.default_data
      );

      const customizedJs = this.applyCustomizations(
        template.javascript_template,
        pageData.customizations || {},
        template.default_data
      );

      const customizedServerCode = this.applyCustomizations(
        template.server_code_template,
        pageData.customizations || {},
        template.default_data
      );

      // Create the page
      const page = await pageService.createPage({
        title: pageData.title,
        slug: pageData.slug,
        description: pageData.description || template.description,
        htmlContent: customizedHtml,
        cssContent: customizedCss,
        javascriptContent: customizedJs,
        serverCode: customizedServerCode,
        isStatic: pageData.isStatic !== undefined ? pageData.isStatic : false,
        isPublic: pageData.isPublic !== undefined ? pageData.isPublic : false,
        status: pageData.status || 'draft',
        pageData: {
          ...pageData.pageData,
          templateId: template.id,
          templateName: template.name
        }
      }, userId);

      // Increment template uses
      await Template.increment('uses_count', { where: { id: template.id } });

      logger.info('Page created from template', {
        pageId: page.id,
        templateId: template.id,
        userId
      });

      return page;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to create page from template', {
        error: error.message,
        templateId,
        userId
      });
      throw error;
    }
  }

  /**
   * Apply customizations to template string
   */
  applyCustomizations(templateString, customizations, defaults) {
    if (!templateString) return '';

    let result = templateString;

    // Merge customizations with defaults
    const data = { ...defaults, ...customizations };

    // Replace placeholders like {{variableName}}
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, value);
    }

    return result;
  }

  /**
   * Update template
   */
  async updateTemplate(identifier, updates, userId) {
    try {
      const template = await this.getTemplate(identifier, userId);

      // Only owner can update
      if (template.created_by !== userId) {
        throw new AppError('Only template owner can update it', 403);
      }

      const allowedFields = [
        'name', 'slug', 'category', 'description', 'thumbnail_url',
        'html_template', 'css_template', 'javascript_template',
        'server_code_template', 'customization_schema', 'default_data',
        'required_components', 'tags', 'is_public', 'is_featured'
      ];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          template[field] = updates[field];
        }
      }

      await template.save();

      logger.info('Template updated', {
        templateId: template.id,
        userId
      });

      return template;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to update template', { error: error.message, identifier, userId });
      throw error;
    }
  }

  /**
   * Delete template
   */
  async deleteTemplate(identifier, userId) {
    try {
      const template = await this.getTemplate(identifier, userId);

      if (template.created_by !== userId) {
        throw new AppError('Only template owner can delete it', 403);
      }

      await template.destroy();

      logger.info('Template deleted', {
        templateId: template.id,
        userId
      });

      return true;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to delete template', { error: error.message, identifier, userId });
      throw error;
    }
  }

  /**
   * Rate template
   */
  async rateTemplate(templateId, rating, userId) {
    try {
      if (rating < 0 || rating > 5) {
        throw new AppError('Rating must be between 0 and 5', 400);
      }

      const template = await this.getTemplate(templateId);

      // Update average rating
      const currentTotal = parseFloat(template.rating) * template.rating_count;
      const newTotal = currentTotal + rating;
      const newCount = template.rating_count + 1;
      const newAverage = newTotal / newCount;

      template.rating = newAverage.toFixed(2);
      template.rating_count = newCount;
      await template.save();

      logger.info('Template rated', {
        templateId: template.id,
        rating,
        newAverage,
        userId
      });

      return template;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to rate template', { error: error.message, templateId, userId });
      throw error;
    }
  }

  /**
   * Get featured templates
   */
  async getFeaturedTemplates(limit = 10) {
    try {
      const templates = await Template.findAll({
        where: {
          is_featured: true,
          is_public: true
        },
        order: [['rating', 'DESC']],
        limit
      });

      return templates.map(t => t.toPreviewJSON());
    } catch (error) {
      logger.error('Failed to get featured templates', { error: error.message });
      throw error;
    }
  }

  /**
   * Get popular templates
   */
  async getPopularTemplates(limit = 10) {
    try {
      const templates = await Template.findAll({
        where: { is_public: true },
        order: [['uses_count', 'DESC']],
        limit
      });

      return templates.map(t => t.toPreviewJSON());
    } catch (error) {
      logger.error('Failed to get popular templates', { error: error.message });
      throw error;
    }
  }
}

module.exports = new TemplateService();
