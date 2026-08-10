/**
 * ═══════════════════════════════════════════════════════════
 * Component Service
 * Business logic for component library management
 * ═══════════════════════════════════════════════════════════
 */

const Component = require('../models/Component');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class ComponentService {
  /**
   * Create a new component
   */
  async createComponent(data, userId) {
    try {
      const component = await Component.create({
        created_by: userId,
        name: data.name,
        slug: data.slug,
        category: data.category || 'other',
        description: data.description,
        preview_url: data.previewUrl,
        html: data.html,
        css: data.css,
        javascript: data.javascript,
        props_schema: data.propsSchema || {},
        default_props: data.defaultProps || {},
        dependencies: data.dependencies || [],
        tags: data.tags || [],
        is_public: data.isPublic !== undefined ? data.isPublic : false,
        version: data.version || '1.0.0'
      });

      logger.info('Component created', {
        componentId: component.id,
        name: component.name,
        userId
      });

      return component;
    } catch (error) {
      logger.error('Failed to create component', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Get component by ID or slug
   */
  async getComponent(identifier, userId = null) {
    try {
      const where = identifier.match(/^[0-9a-f-]{36}$/)
        ? { id: identifier }
        : { slug: identifier };

      const component = await Component.findOne({ where });

      if (!component) {
        throw new AppError('Component not found', 404);
      }

      // Check access for private components
      if (!component.is_public && userId && !component.canAccess(userId)) {
        throw new AppError('Access denied', 403);
      }

      return component;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to get component', { error: error.message, identifier });
      throw error;
    }
  }

  /**
   * List components with filters
   */
  async listComponents(filters = {}) {
    try {
      const where = {};

      if (filters.category) {
        where.category = filters.category;
      }

      if (filters.isPublic !== undefined) {
        where.is_public = filters.isPublic;
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

      const components = await Component.findAll({
        where,
        order: [[orderBy, orderDirection]],
        limit: filters.limit || 50,
        offset: filters.offset || 0
      });

      return components.map(c => c.toLibraryJSON());
    } catch (error) {
      logger.error('Failed to list components', { error: error.message });
      throw error;
    }
  }

  /**
   * Update component
   */
  async updateComponent(identifier, updates, userId) {
    try {
      const component = await this.getComponent(identifier, userId);

      // Only owner can update
      if (component.created_by !== userId) {
        throw new AppError('Only component owner can update it', 403);
      }

      const allowedFields = [
        'name', 'slug', 'category', 'description', 'preview_url',
        'html', 'css', 'javascript', 'props_schema', 'default_props',
        'dependencies', 'tags', 'is_public', 'version'
      ];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          component[field] = updates[field];
        }
      }

      await component.save();

      logger.info('Component updated', {
        componentId: component.id,
        userId
      });

      return component;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to update component', { error: error.message, identifier, userId });
      throw error;
    }
  }

  /**
   * Delete component
   */
  async deleteComponent(identifier, userId) {
    try {
      const component = await this.getComponent(identifier, userId);

      if (component.created_by !== userId) {
        throw new AppError('Only component owner can delete it', 403);
      }

      await component.destroy();

      logger.info('Component deleted', {
        componentId: component.id,
        userId
      });

      return true;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to delete component', { error: error.message, identifier, userId });
      throw error;
    }
  }

  /**
   * Get components by category
   */
  async getComponentsByCategory(category, limit = 20) {
    try {
      const components = await Component.findAll({
        where: {
          category,
          is_public: true
        },
        order: [['uses_count', 'DESC']],
        limit
      });

      return components.map(c => c.toLibraryJSON());
    } catch (error) {
      logger.error('Failed to get components by category', { error: error.message, category });
      throw error;
    }
  }

  /**
   * Get popular components
   */
  async getPopularComponents(limit = 10) {
    try {
      const components = await Component.findAll({
        where: { is_public: true },
        order: [['uses_count', 'DESC']],
        limit
      });

      return components.map(c => c.toLibraryJSON());
    } catch (error) {
      logger.error('Failed to get popular components', { error: error.message });
      throw error;
    }
  }

  /**
   * Render component with props
   */
  renderComponent(component, props = {}) {
    try {
      // Merge provided props with defaults
      const finalProps = { ...component.default_props, ...props };

      // Validate props against schema if schema exists
      if (component.props_schema && Object.keys(component.props_schema).length > 0) {
        this.validateProps(finalProps, component.props_schema);
      }

      // Replace placeholders in HTML
      let html = component.html;
      for (const [key, value] of Object.entries(finalProps)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        html = html.replace(regex, value);
      }

      // Wrap CSS in a style tag if provided
      const css = component.css ? `<style>${component.css}</style>` : '';

      // Wrap JavaScript in a script tag if provided
      const javascript = component.javascript ? `<script>${component.javascript}</script>` : '';

      return {
        html,
        css,
        javascript,
        combined: `${css}\n${html}\n${javascript}`
      };
    } catch (error) {
      logger.error('Failed to render component', {
        error: error.message,
        componentId: component.id
      });
      throw error;
    }
  }

  /**
   * Validate props against schema
   */
  validateProps(props, schema) {
    for (const [key, definition] of Object.entries(schema)) {
      const value = props[key];

      // Check required fields
      if (definition.required && (value === undefined || value === null)) {
        throw new AppError(`Required prop '${key}' is missing`, 400);
      }

      // Check type if value is provided
      if (value !== undefined && value !== null && definition.type) {
        const actualType = typeof value;
        if (actualType !== definition.type) {
          throw new AppError(
            `Prop '${key}' should be of type '${definition.type}', got '${actualType}'`,
            400
          );
        }
      }

      // Check enum values
      if (value !== undefined && definition.enum && !definition.enum.includes(value)) {
        throw new AppError(
          `Prop '${key}' must be one of: ${definition.enum.join(', ')}`,
          400
        );
      }

      // Check min/max for numbers
      if (typeof value === 'number') {
        if (definition.min !== undefined && value < definition.min) {
          throw new AppError(`Prop '${key}' must be >= ${definition.min}`, 400);
        }
        if (definition.max !== undefined && value > definition.max) {
          throw new AppError(`Prop '${key}' must be <= ${definition.max}`, 400);
        }
      }

      // Check minLength/maxLength for strings
      if (typeof value === 'string') {
        if (definition.minLength !== undefined && value.length < definition.minLength) {
          throw new AppError(`Prop '${key}' must be at least ${definition.minLength} characters`, 400);
        }
        if (definition.maxLength !== undefined && value.length > definition.maxLength) {
          throw new AppError(`Prop '${key}' must be at most ${definition.maxLength} characters`, 400);
        }
      }
    }
  }

  /**
   * Increment usage count for component
   */
  async incrementUsage(componentId) {
    try {
      await Component.increment('uses_count', { where: { id: componentId } });

      logger.info('Component usage incremented', { componentId });
    } catch (error) {
      logger.error('Failed to increment component usage', {
        error: error.message,
        componentId
      });
      // Don't throw - this is non-critical
    }
  }

  /**
   * Search components by keyword
   */
  async searchComponents(keyword, filters = {}) {
    try {
      const { Op } = require('sequelize');

      const where = {
        [Op.or]: [
          { name: { [Op.iLike]: `%${keyword}%` } },
          { description: { [Op.iLike]: `%${keyword}%` } },
          { tags: { [Op.overlap]: [keyword] } }
        ]
      };

      if (filters.category) {
        where.category = filters.category;
      }

      if (filters.isPublic !== undefined) {
        where.is_public = filters.isPublic;
      }

      const components = await Component.findAll({
        where,
        order: [['uses_count', 'DESC']],
        limit: filters.limit || 20,
        offset: filters.offset || 0
      });

      return components.map(c => c.toLibraryJSON());
    } catch (error) {
      logger.error('Failed to search components', { error: error.message, keyword });
      throw error;
    }
  }

  /**
   * Get components with dependencies
   */
  async getComponentWithDependencies(componentId) {
    try {
      const component = await this.getComponent(componentId);
      const dependencies = [];

      if (component.dependencies && component.dependencies.length > 0) {
        for (const depId of component.dependencies) {
          try {
            const dep = await this.getComponent(depId);
            dependencies.push(dep);
          } catch (error) {
            logger.warn('Failed to load component dependency', {
              componentId,
              dependencyId: depId,
              error: error.message
            });
          }
        }
      }

      return {
        component,
        dependencies
      };
    } catch (error) {
      logger.error('Failed to get component with dependencies', {
        error: error.message,
        componentId
      });
      throw error;
    }
  }
}

module.exports = new ComponentService();
