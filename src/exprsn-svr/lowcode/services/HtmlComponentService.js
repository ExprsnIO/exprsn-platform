/**
 * ═══════════════════════════════════════════════════════════
 * HTML Component Service
 * Component marketplace and custom component management
 * ═══════════════════════════════════════════════════════════
 */

const { Op } = require('sequelize');
const models = require('../models');
const logger = require('../utils/logger');

class HtmlComponentService {
  /**
   * List components with filtering
   */
  static async listComponents(options = {}) {
    try {
      const {
        category,
        search,
        isPublic,
        isSystem,
        authorId,
        organizationId,
        page = 1,
        limit = 50
      } = options;

      const where = {};

      if (category) where.category = category;
      if (isPublic !== undefined) where.isPublic = isPublic;
      if (isSystem !== undefined) where.isSystem = isSystem;
      if (authorId) where.authorId = authorId;
      if (organizationId) where.organizationId = organizationId;

      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } },
          { category: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.HtmlComponent.findAndCountAll({
        where,
        limit,
        offset,
        order: [
          ['isSystem', 'DESC'],
          ['downloads', 'DESC'],
          ['rating', 'DESC'],
          ['name', 'ASC']
        ]
      });

      return {
        success: true,
        data: {
          components: rows,
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('Error listing components:', error);
      return {
        success: false,
        error: 'LIST_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Get component by ID
   */
  static async getComponent(componentId) {
    try {
      const component = await models.HtmlComponent.findByPk(componentId);

      if (!component) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Component not found'
        };
      }

      return {
        success: true,
        data: component
      };
    } catch (error) {
      logger.error('Error fetching component:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Create new component
   */
  static async createComponent(data) {
    try {
      const {
        name,
        category,
        description,
        htmlTemplate,
        css,
        javascript,
        properties,
        dependencies,
        icon,
        isPublic,
        authorId,
        organizationId
      } = data;

      // Generate slug
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // Check for duplicate slug
      const existing = await models.HtmlComponent.findOne({ where: { slug } });
      if (existing) {
        return {
          success: false,
          error: 'DUPLICATE_SLUG',
          message: 'A component with this name already exists'
        };
      }

      const component = await models.HtmlComponent.create({
        name,
        slug,
        category,
        description,
        htmlTemplate,
        css,
        javascript,
        properties: properties || [],
        dependencies: dependencies || [],
        icon,
        isPublic: isPublic || false,
        isSystem: false,
        authorId,
        organizationId,
        version: '1.0.0',
        downloads: 0,
        rating: 0
      });

      logger.info(`Component created: ${component.id}`, { componentId: component.id, authorId });

      return {
        success: true,
        data: component
      };
    } catch (error) {
      logger.error('Error creating component:', error);
      return {
        success: false,
        error: 'CREATION_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Update component
   */
  static async updateComponent(componentId, updates) {
    try {
      const component = await models.HtmlComponent.findByPk(componentId);

      if (!component) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Component not found'
        };
      }

      // Don't allow updating system components
      if (component.isSystem) {
        return {
          success: false,
          error: 'SYSTEM_COMPONENT',
          message: 'Cannot update system components'
        };
      }

      // Update allowed fields
      const allowedFields = [
        'name',
        'category',
        'description',
        'htmlTemplate',
        'css',
        'javascript',
        'properties',
        'dependencies',
        'icon',
        'isPublic',
        'version'
      ];

      const updateData = {};
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updateData[field] = updates[field];
        }
      }

      await component.update(updateData);

      logger.info(`Component updated: ${componentId}`, { componentId });

      return {
        success: true,
        data: component
      };
    } catch (error) {
      logger.error('Error updating component:', error);
      return {
        success: false,
        error: 'UPDATE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Delete component
   */
  static async deleteComponent(componentId) {
    try {
      const component = await models.HtmlComponent.findByPk(componentId);

      if (!component) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Component not found'
        };
      }

      // Don't allow deleting system components
      if (component.isSystem) {
        return {
          success: false,
          error: 'SYSTEM_COMPONENT',
          message: 'Cannot delete system components'
        };
      }

      await component.destroy();

      logger.info(`Component deleted: ${componentId}`, { componentId });

      return {
        success: true,
        message: 'Component deleted successfully'
      };
    } catch (error) {
      logger.error('Error deleting component:', error);
      return {
        success: false,
        error: 'DELETE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Install component to project
   */
  static async installComponent(projectId, componentId) {
    try {
      // Check if already installed
      const existing = await models.HtmlProjectComponent.findOne({
        where: { projectId, componentId }
      });

      if (existing) {
        return {
          success: false,
          error: 'ALREADY_INSTALLED',
          message: 'Component already installed in this project'
        };
      }

      // Create association
      await models.HtmlProjectComponent.create({
        projectId,
        componentId
      });

      // Increment download counter
      const component = await models.HtmlComponent.findByPk(componentId);
      if (component) {
        await component.increment('downloads');
      }

      logger.info(`Component installed to project`, { projectId, componentId });

      return {
        success: true,
        message: 'Component installed successfully'
      };
    } catch (error) {
      logger.error('Error installing component:', error);
      return {
        success: false,
        error: 'INSTALL_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Uninstall component from project
   */
  static async uninstallComponent(projectId, componentId) {
    try {
      await models.HtmlProjectComponent.destroy({
        where: { projectId, componentId }
      });

      logger.info(`Component uninstalled from project`, { projectId, componentId });

      return {
        success: true,
        message: 'Component uninstalled successfully'
      };
    } catch (error) {
      logger.error('Error uninstalling component:', error);
      return {
        success: false,
        error: 'UNINSTALL_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Get components installed in a project
   */
  static async getProjectComponents(projectId) {
    try {
      const project = await models.HtmlProject.findByPk(projectId, {
        include: [{
          model: models.HtmlComponent,
          as: 'components'
        }]
      });

      if (!project) {
        return {
          success: false,
          error: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        };
      }

      return {
        success: true,
        data: project.components
      };
    } catch (error) {
      logger.error('Error fetching project components:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Get component categories
   */
  static async getCategories() {
    try {
      const categories = await models.HtmlComponent.findAll({
        attributes: ['category'],
        group: ['category'],
        order: [['category', 'ASC']]
      });

      return {
        success: true,
        data: categories.map(c => c.category)
      };
    } catch (error) {
      logger.error('Error fetching categories:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Rate component
   */
  static async rateComponent(componentId, rating) {
    try {
      const component = await models.HtmlComponent.findByPk(componentId);

      if (!component) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Component not found'
        };
      }

      // Simple rating update (in production, would track individual ratings)
      const newRating = ((component.rating * component.downloads) + rating) / (component.downloads + 1);
      await component.update({ rating: newRating.toFixed(2) });

      return {
        success: true,
        data: { rating: newRating }
      };
    } catch (error) {
      logger.error('Error rating component:', error);
      return {
        success: false,
        error: 'RATING_FAILED',
        message: error.message
      };
    }
  }
}

module.exports = HtmlComponentService;
