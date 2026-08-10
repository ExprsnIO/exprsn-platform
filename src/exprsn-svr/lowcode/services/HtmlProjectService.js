/**
 * ═══════════════════════════════════════════════════════════
 * HTML Project Service
 * Business logic for HTML application project management
 * ═══════════════════════════════════════════════════════════
 */

const { Op } = require('sequelize');
const models = require('../models');
const logger = require('../utils/logger');

class HtmlProjectService {
  /**
   * Create a new HTML project
   */
  static async createProject(data) {
    try {
      const { name, description, ownerId, organizationId, applicationId, settings } = data;

      // Generate slug from name
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // Check for duplicate slug
      const existing = await models.HtmlProject.findOne({ where: { slug } });
      if (existing) {
        // Append random suffix to make unique
        const uniqueSlug = `${slug}-${Date.now()}`;
        return await this.createProject({ ...data, slug: uniqueSlug });
      }

      const project = await models.HtmlProject.create({
        name,
        slug,
        description,
        ownerId,
        organizationId,
        applicationId,
        status: 'draft',
        settings: settings || {},
        metadata: {}
      });

      // Create default file structure
      await this._createDefaultFileStructure(project.id, ownerId);

      logger.info(`HTML project created: ${project.id}`, { projectId: project.id, ownerId });

      return {
        success: true,
        data: project.toSafeObject()
      };
    } catch (error) {
      logger.error('Error creating HTML project:', error);
      return {
        success: false,
        error: 'CREATION_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Get project by ID with optional includes
   */
  static async getProject(projectId, options = {}) {
    try {
      const include = [];

      if (options.includeFiles) {
        include.push({
          model: models.HtmlFile,
          as: 'files',
          where: { parentId: null }, // Only root files
          required: false
        });
      }

      if (options.includeLibraries) {
        include.push({
          model: models.HtmlLibrary,
          as: 'libraries',
          through: { attributes: ['loadOrder', 'isEnabled'] }
        });
      }

      if (options.includeComponents) {
        include.push({
          model: models.HtmlComponent,
          as: 'components'
        });
      }

      const project = await models.HtmlProject.findByPk(projectId, { include });

      if (!project) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Project not found'
        };
      }

      return {
        success: true,
        data: project
      };
    } catch (error) {
      logger.error('Error fetching HTML project:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }

  /**
   * List projects with filtering and pagination
   */
  static async listProjects(options = {}) {
    try {
      const {
        ownerId,
        organizationId,
        status,
        page = 1,
        limit = 20,
        search
      } = options;

      const where = {};

      if (ownerId) where.ownerId = ownerId;
      if (organizationId) where.organizationId = organizationId;
      if (status) where.status = status;

      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.HtmlProject.findAndCountAll({
        where,
        limit,
        offset,
        order: [['updatedAt', 'DESC']]
      });

      return {
        success: true,
        data: {
          projects: rows.map(p => p.toSafeObject()),
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('Error listing HTML projects:', error);
      return {
        success: false,
        error: 'LIST_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Update project
   */
  static async updateProject(projectId, updates) {
    try {
      const project = await models.HtmlProject.findByPk(projectId);

      if (!project) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Project not found'
        };
      }

      // Update allowed fields
      const allowedFields = ['name', 'description', 'status', 'settings', 'metadata'];
      const updateData = {};

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updateData[field] = updates[field];
        }
      }

      await project.update(updateData);

      logger.info(`HTML project updated: ${projectId}`, { projectId });

      return {
        success: true,
        data: project.toSafeObject()
      };
    } catch (error) {
      logger.error('Error updating HTML project:', error);
      return {
        success: false,
        error: 'UPDATE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Delete project
   */
  static async deleteProject(projectId) {
    try {
      const project = await models.HtmlProject.findByPk(projectId);

      if (!project) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Project not found'
        };
      }

      await project.destroy();

      logger.info(`HTML project deleted: ${projectId}`, { projectId });

      return {
        success: true,
        message: 'Project deleted successfully'
      };
    } catch (error) {
      logger.error('Error deleting HTML project:', error);
      return {
        success: false,
        error: 'DELETE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Duplicate project
   */
  static async duplicateProject(projectId, ownerId, newName) {
    try {
      const original = await models.HtmlProject.findByPk(projectId, {
        include: [
          { model: models.HtmlFile, as: 'files' },
          { model: models.HtmlLibrary, as: 'libraries' },
          { model: models.HtmlComponent, as: 'components' },
          { model: models.HtmlDataSource, as: 'dataSources' }
        ]
      });

      if (!original) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Project not found'
        };
      }

      // Create new project
      const result = await this.createProject({
        name: newName || `${original.name} (Copy)`,
        description: original.description,
        ownerId,
        organizationId: original.organizationId,
        settings: original.settings
      });

      if (!result.success) {
        return result;
      }

      const newProject = await models.HtmlProject.findByPk(result.data.id);

      // Copy files
      if (original.files) {
        for (const file of original.files) {
          await this._duplicateFileTree(file, newProject.id, null, ownerId);
        }
      }

      // Copy library associations
      if (original.libraries) {
        for (const library of original.libraries) {
          await models.HtmlProjectLibrary.create({
            projectId: newProject.id,
            libraryId: library.id,
            loadOrder: library.HtmlProjectLibrary.loadOrder,
            isEnabled: library.HtmlProjectLibrary.isEnabled
          });
        }
      }

      // Copy component associations
      if (original.components) {
        for (const component of original.components) {
          await models.HtmlProjectComponent.create({
            projectId: newProject.id,
            componentId: component.id
          });
        }
      }

      // Copy data sources
      if (original.dataSources) {
        for (const ds of original.dataSources) {
          await models.HtmlDataSource.create({
            projectId: newProject.id,
            name: ds.name,
            type: ds.type,
            configuration: ds.configuration,
            isActive: ds.isActive,
            createdBy: ownerId
          });
        }
      }

      logger.info(`HTML project duplicated: ${projectId} -> ${newProject.id}`);

      return {
        success: true,
        data: newProject.toSafeObject()
      };
    } catch (error) {
      logger.error('Error duplicating HTML project:', error);
      return {
        success: false,
        error: 'DUPLICATION_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Add library to project
   */
  static async addLibrary(projectId, libraryId, loadOrder = 0) {
    try {
      const [association, created] = await models.HtmlProjectLibrary.findOrCreate({
        where: { projectId, libraryId },
        defaults: { loadOrder, isEnabled: true }
      });

      return {
        success: true,
        data: association,
        created
      };
    } catch (error) {
      logger.error('Error adding library to project:', error);
      return {
        success: false,
        error: 'ADD_LIBRARY_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Remove library from project
   */
  static async removeLibrary(projectId, libraryId) {
    try {
      await models.HtmlProjectLibrary.destroy({
        where: { projectId, libraryId }
      });

      return {
        success: true,
        message: 'Library removed from project'
      };
    } catch (error) {
      logger.error('Error removing library from project:', error);
      return {
        success: false,
        error: 'REMOVE_LIBRARY_FAILED',
        message: error.message
      };
    }
  }

  /**
   * PRIVATE: Create default file structure for new project
   */
  static async _createDefaultFileStructure(projectId, userId) {
    // Create index.html
    await models.HtmlFile.create({
      projectId,
      name: 'index.html',
      path: '/index.html',
      type: 'html',
      isEntryPoint: true,
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New HTML Project</title>
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <div class="container">
        <h1>Welcome to Your HTML Project</h1>
        <p>Start building your application here!</p>
    </div>
    <script src="js/app.js"></script>
</body>
</html>`,
      createdBy: userId,
      order: 0
    });

    // Create CSS folder
    const cssFolder = await models.HtmlFile.create({
      projectId,
      name: 'css',
      path: '/css',
      type: 'folder',
      createdBy: userId,
      order: 1
    });

    // Create style.css
    await models.HtmlFile.create({
      projectId,
      parentId: cssFolder.id,
      name: 'style.css',
      path: '/css/style.css',
      type: 'css',
      content: `/* Main stylesheet */
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    margin: 0;
    padding: 0;
    line-height: 1.6;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

h1 {
    color: #333;
}`,
      createdBy: userId,
      order: 0
    });

    // Create JS folder
    const jsFolder = await models.HtmlFile.create({
      projectId,
      name: 'js',
      path: '/js',
      type: 'folder',
      createdBy: userId,
      order: 2
    });

    // Create app.js
    await models.HtmlFile.create({
      projectId,
      parentId: jsFolder.id,
      name: 'app.js',
      path: '/js/app.js',
      type: 'javascript',
      content: `// Main application JavaScript
document.addEventListener('DOMContentLoaded', function() {
    console.log('HTML Project loaded successfully!');
});`,
      createdBy: userId,
      order: 0
    });

    // Create assets folder
    await models.HtmlFile.create({
      projectId,
      name: 'assets',
      path: '/assets',
      type: 'folder',
      createdBy: userId,
      order: 3
    });
  }

  /**
   * PRIVATE: Recursively duplicate file tree
   */
  static async _duplicateFileTree(file, newProjectId, newParentId, userId) {
    const newFile = await models.HtmlFile.create({
      projectId: newProjectId,
      parentId: newParentId,
      name: file.name,
      path: newParentId ? `${newParentId}/${file.name}` : `/${file.name}`,
      type: file.type,
      content: file.content,
      contentType: file.contentType,
      size: file.size,
      storagePath: file.storagePath,
      isEntryPoint: file.isEntryPoint,
      order: file.order,
      metadata: file.metadata,
      createdBy: userId
    });

    // Recursively copy children if this is a folder
    if (file.type === 'folder') {
      const children = await models.HtmlFile.findAll({
        where: { parentId: file.id }
      });

      for (const child of children) {
        await this._duplicateFileTree(child, newProjectId, newFile.id, userId);
      }
    }

    return newFile;
  }
}

module.exports = HtmlProjectService;
