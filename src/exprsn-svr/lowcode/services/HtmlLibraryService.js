/**
 * ═══════════════════════════════════════════════════════════
 * HTML Library Service
 * External JavaScript/CSS library management
 * ═══════════════════════════════════════════════════════════
 */

const { Op } = require('sequelize');
const models = require('../models');
const logger = require('../utils/logger');

class HtmlLibraryService {
  /**
   * List libraries with filtering
   */
  static async listLibraries(options = {}) {
    try {
      const {
        type,
        search,
        isActive,
        isPopular,
        page = 1,
        limit = 50
      } = options;

      const where = {};

      if (type) where.type = type;
      if (isActive !== undefined) where.isActive = isActive;
      if (isPopular !== undefined) where.isPopular = isPopular;

      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.HtmlLibrary.findAndCountAll({
        where,
        limit,
        offset,
        order: [
          ['isPopular', 'DESC'],
          ['name', 'ASC']
        ]
      });

      return {
        success: true,
        data: {
          libraries: rows,
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('Error listing libraries:', error);
      return {
        success: false,
        error: 'LIST_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Get library by ID
   */
  static async getLibrary(libraryId) {
    try {
      const library = await models.HtmlLibrary.findByPk(libraryId);

      if (!library) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Library not found'
        };
      }

      return {
        success: true,
        data: library
      };
    } catch (error) {
      logger.error('Error fetching library:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Create new library (admin only)
   */
  static async createLibrary(data) {
    try {
      const {
        name,
        version,
        description,
        type,
        cdnCssUrl,
        cdnJsUrl,
        localCssPath,
        localJsPath,
        integrityCss,
        integrityJs,
        dependencies,
        isPopular
      } = data;

      // Check for duplicate
      const existing = await models.HtmlLibrary.findOne({ where: { name } });
      if (existing) {
        return {
          success: false,
          error: 'DUPLICATE_NAME',
          message: 'A library with this name already exists'
        };
      }

      const library = await models.HtmlLibrary.create({
        name,
        version,
        description,
        type,
        cdnCssUrl,
        cdnJsUrl,
        localCssPath,
        localJsPath,
        integrityCss,
        integrityJs,
        dependencies: dependencies || [],
        isActive: true,
        isPopular: isPopular || false
      });

      logger.info(`Library created: ${library.id}`, { libraryId: library.id, name });

      return {
        success: true,
        data: library
      };
    } catch (error) {
      logger.error('Error creating library:', error);
      return {
        success: false,
        error: 'CREATION_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Update library
   */
  static async updateLibrary(libraryId, updates) {
    try {
      const library = await models.HtmlLibrary.findByPk(libraryId);

      if (!library) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Library not found'
        };
      }

      // Update allowed fields
      const allowedFields = [
        'version',
        'description',
        'cdnCssUrl',
        'cdnJsUrl',
        'localCssPath',
        'localJsPath',
        'integrityCss',
        'integrityJs',
        'dependencies',
        'isActive',
        'isPopular'
      ];

      const updateData = {};
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updateData[field] = updates[field];
        }
      }

      await library.update(updateData);

      logger.info(`Library updated: ${libraryId}`, { libraryId });

      return {
        success: true,
        data: library
      };
    } catch (error) {
      logger.error('Error updating library:', error);
      return {
        success: false,
        error: 'UPDATE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Delete library
   */
  static async deleteLibrary(libraryId) {
    try {
      const library = await models.HtmlLibrary.findByPk(libraryId);

      if (!library) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Library not found'
        };
      }

      // Check if used in any projects
      const usage = await models.HtmlProjectLibrary.count({
        where: { libraryId }
      });

      if (usage > 0) {
        return {
          success: false,
          error: 'IN_USE',
          message: `Library is used in ${usage} project(s). Cannot delete.`
        };
      }

      await library.destroy();

      logger.info(`Library deleted: ${libraryId}`, { libraryId });

      return {
        success: true,
        message: 'Library deleted successfully'
      };
    } catch (error) {
      logger.error('Error deleting library:', error);
      return {
        success: false,
        error: 'DELETE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Get libraries for a project with load order
   */
  static async getProjectLibraries(projectId) {
    try {
      const project = await models.HtmlProject.findByPk(projectId, {
        include: [{
          model: models.HtmlLibrary,
          as: 'libraries',
          through: {
            attributes: ['loadOrder', 'isEnabled']
          }
        }]
      });

      if (!project) {
        return {
          success: false,
          error: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        };
      }

      // Sort by load order
      const libraries = (project.libraries || []).sort((a, b) => {
        return (a.HtmlProjectLibrary?.loadOrder || 0) - (b.HtmlProjectLibrary?.loadOrder || 0);
      });

      return {
        success: true,
        data: libraries
      };
    } catch (error) {
      logger.error('Error fetching project libraries:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Update library load order in project
   */
  static async updateLoadOrder(projectId, libraryId, loadOrder) {
    try {
      const association = await models.HtmlProjectLibrary.findOne({
        where: { projectId, libraryId }
      });

      if (!association) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Library not found in project'
        };
      }

      await association.update({ loadOrder });

      return {
        success: true,
        message: 'Load order updated'
      };
    } catch (error) {
      logger.error('Error updating load order:', error);
      return {
        success: false,
        error: 'UPDATE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Toggle library enabled/disabled in project
   */
  static async toggleLibrary(projectId, libraryId, isEnabled) {
    try {
      const association = await models.HtmlProjectLibrary.findOne({
        where: { projectId, libraryId }
      });

      if (!association) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Library not found in project'
        };
      }

      await association.update({ isEnabled });

      return {
        success: true,
        message: `Library ${isEnabled ? 'enabled' : 'disabled'}`
      };
    } catch (error) {
      logger.error('Error toggling library:', error);
      return {
        success: false,
        error: 'TOGGLE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Get popular libraries
   */
  static async getPopularLibraries() {
    try {
      const libraries = await models.HtmlLibrary.findAll({
        where: {
          isActive: true,
          isPopular: true
        },
        order: [['name', 'ASC']]
      });

      return {
        success: true,
        data: libraries
      };
    } catch (error) {
      logger.error('Error fetching popular libraries:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }
}

module.exports = HtmlLibraryService;
