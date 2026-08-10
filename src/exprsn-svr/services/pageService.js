/**
 * ═══════════════════════════════════════════════════════════
 * Page Service
 * Business logic for creating, managing, and serving pages
 * ═══════════════════════════════════════════════════════════
 */

const Page = require('../models/Page');
const PageVersion = require('../models/PageVersion');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class PageService {
  /**
   * Create a new page
   */
  async createPage(data, userId) {
    try {
      const page = await Page.create({
        owner_id: userId,
        title: data.title,
        slug: data.slug,
        description: data.description,
        html_content: data.htmlContent || '',
        css_content: data.cssContent || '',
        javascript_content: data.javascriptContent || '',
        server_code: data.serverCode || '',
        is_static: data.isStatic !== undefined ? data.isStatic : false,
        is_public: data.isPublic !== undefined ? data.isPublic : false,
        status: data.status || 'draft',
        page_data: data.pageData || {},
        socket_events: data.socketEvents || [],
        api_routes: data.apiRoutes || []
      });

      logger.info('Page created', {
        pageId: page.id,
        slug: page.slug,
        userId
      });

      return page;
    } catch (error) {
      logger.error('Failed to create page', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Get page by ID or slug
   */
  async getPage(identifier, userId = null) {
    try {
      const where = identifier.match(/^[0-9a-f-]{36}$/) 
        ? { id: identifier }
        : { slug: identifier };

      const page = await Page.findOne({ where });

      if (!page) {
        throw new AppError('Page not found', 404);
      }

      // Check access permissions
      if (!page.is_public && userId && !page.canAccess(userId, 'read')) {
        throw new AppError('Access denied', 403);
      }

      return page;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to get page', { error: error.message, identifier });
      throw error;
    }
  }

  /**
   * Update page
   */
  async updatePage(identifier, updates, userId) {
    try {
      const page = await this.getPage(identifier, userId);

      // Check edit permission
      if (!page.canAccess(userId, 'write')) {
        throw new AppError('No permission to edit this page', 403);
      }

      // Update fields
      const allowedFields = [
        'title', 'slug', 'description', 'html_content', 'css_content',
        'javascript_content', 'server_code', 'is_static', 'is_public',
        'status', 'page_data', 'socket_events', 'api_routes'
      ];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          const dbField = field;
          page[dbField] = updates[field];
        }
      }

      page.version += 1;
      await page.save();

      logger.info('Page updated', {
        pageId: page.id,
        version: page.version,
        userId
      });

      return page;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to update page', { error: error.message, identifier, userId });
      throw error;
    }
  }

  /**
   * Delete page
   */
  async deletePage(identifier, userId) {
    try {
      const page = await this.getPage(identifier, userId);

      if (page.owner_id !== userId) {
        throw new AppError('Only the page owner can delete it', 403);
      }

      await page.destroy();

      logger.info('Page deleted', {
        pageId: page.id,
        slug: page.slug,
        userId
      });

      return true;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to delete page', { error: error.message, identifier, userId });
      throw error;
    }
  }

  /**
   * List pages
   */
  async listPages(filters = {}, userId = null) {
    try {
      const where = {};

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.isPublic !== undefined) {
        where.is_public = filters.isPublic;
      }

      if (filters.ownerId) {
        where.owner_id = filters.ownerId;
      }

      // If user is not specified, only show public pages
      if (!userId) {
        where.is_public = true;
      }

      const pages = await Page.findAll({
        where,
        order: [['created_at', 'DESC']],
        limit: filters.limit || 50,
        offset: filters.offset || 0
      });

      return pages;
    } catch (error) {
      logger.error('Failed to list pages', { error: error.message });
      throw error;
    }
  }

  /**
   * Publish page
   */
  async publishPage(identifier, userId) {
    try {
      const page = await this.getPage(identifier, userId);

      if (!page.canAccess(userId, 'write')) {
        throw new AppError('No permission to publish this page', 403);
      }

      page.status = 'published';
      page.published_at = new Date();
      await page.save();

      logger.info('Page published', {
        pageId: page.id,
        userId
      });

      return page;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to publish page', { error: error.message, identifier, userId });
      throw error;
    }
  }

  /**
   * Increment page views
   */
  async incrementViews(pageId) {
    try {
      await Page.increment('views_count', { where: { id: pageId } });
    } catch (error) {
      logger.error('Failed to increment views', { error: error.message, pageId });
    }
  }

  /**
   * Create a version snapshot of a page
   */
  async createVersion(pageId, userId, changeSummary = null, isAutoSave = false) {
    try {
      const page = await this.getPage(pageId);

      // Get next version number
      const latestVersion = await PageVersion.findOne({
        where: { page_id: pageId },
        order: [['version_number', 'DESC']]
      });

      const versionNumber = latestVersion ? latestVersion.version_number + 1 : 1;

      // Create version snapshot
      const version = await PageVersion.create({
        page_id: pageId,
        version_number: versionNumber,
        created_by: userId,
        title: page.title,
        html_content: page.html_content,
        css_content: page.css_content,
        javascript_content: page.javascript_content,
        server_code: page.server_code,
        page_data: page.page_data,
        change_summary: changeSummary,
        is_auto_save: isAutoSave
      });

      logger.info('Page version created', {
        pageId,
        versionId: version.id,
        versionNumber,
        userId
      });

      return version;
    } catch (error) {
      logger.error('Failed to create version', { error: error.message, pageId, userId });
      throw error;
    }
  }

  /**
   * Get version history for a page
   */
  async getVersionHistory(pageId, userId, options = {}) {
    try {
      const page = await this.getPage(pageId, userId);

      // Check write access for full history
      const hasWriteAccess = page.canAccess(userId, 'write');

      const where = { page_id: pageId };

      // Hide auto-saves for non-owners
      if (!hasWriteAccess && options.includeAutoSaves !== true) {
        where.is_auto_save = false;
      }

      const versions = await PageVersion.findAll({
        where,
        order: [['version_number', 'DESC']],
        limit: options.limit || 50,
        offset: options.offset || 0
      });

      return versions.map(v => v.toSummaryJSON());
    } catch (error) {
      logger.error('Failed to get version history', { error: error.message, pageId });
      throw error;
    }
  }

  /**
   * Get a specific version
   */
  async getVersion(versionId, userId) {
    try {
      const version = await PageVersion.findByPk(versionId);

      if (!version) {
        throw new AppError('Version not found', 404);
      }

      // Check access to the page
      const page = await this.getPage(version.page_id, userId);
      const isOwner = page.owner_id === userId;

      return version.toSafeJSON(isOwner);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to get version', { error: error.message, versionId });
      throw error;
    }
  }

  /**
   * Compare two versions
   */
  async compareVersions(versionId1, versionId2, userId) {
    try {
      const version1 = await this.getVersion(versionId1, userId);
      const version2 = await this.getVersion(versionId2, userId);

      // Calculate differences
      const diff = {
        version1: {
          id: version1.id,
          version_number: version1.version_number,
          created_at: version1.created_at
        },
        version2: {
          id: version2.id,
          version_number: version2.version_number,
          created_at: version2.created_at
        },
        changes: {
          title: version1.title !== version2.title,
          html: version1.html_content !== version2.html_content,
          css: version1.css_content !== version2.css_content,
          javascript: version1.javascript_content !== version2.javascript_content,
          server_code: version1.server_code !== version2.server_code
        },
        content: {
          title: {
            old: version1.title,
            new: version2.title
          },
          html: {
            old: version1.html_content,
            new: version2.html_content
          },
          css: {
            old: version1.css_content,
            new: version2.css_content
          },
          javascript: {
            old: version1.javascript_content,
            new: version2.javascript_content
          }
        }
      };

      return diff;
    } catch (error) {
      logger.error('Failed to compare versions', { error: error.message });
      throw error;
    }
  }

  /**
   * Restore page from a version
   */
  async restoreVersion(versionId, userId) {
    try {
      const version = await this.getVersion(versionId, userId);
      const page = await this.getPage(version.page_id, userId);

      // Check write access
      if (!page.canAccess(userId, 'write')) {
        throw new AppError('Write access required to restore versions', 403);
      }

      // Create a version snapshot of current state before restoring
      await this.createVersion(
        page.id,
        userId,
        `Backup before restoring to version ${version.version_number}`,
        false
      );

      // Update page with version content
      await page.update({
        title: version.title,
        html_content: version.html_content,
        css_content: version.css_content,
        javascript_content: version.javascript_content,
        server_code: version.server_code,
        page_data: version.page_data,
        version: page.version + 1
      });

      // Create a new version to mark the restore
      const restoredVersion = await this.createVersion(
        page.id,
        userId,
        `Restored from version ${version.version_number}`,
        false
      );

      // Mark which version this was restored from
      await restoredVersion.update({
        restored_from_version: versionId
      });

      logger.info('Page restored from version', {
        pageId: page.id,
        versionId,
        userId
      });

      return page;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to restore version', { error: error.message, versionId, userId });
      throw error;
    }
  }

  /**
   * Delete old auto-save versions (keep last N)
   */
  async cleanupAutoSaves(pageId, keepCount = 10) {
    try {
      const autoSaves = await PageVersion.findAll({
        where: {
          page_id: pageId,
          is_auto_save: true
        },
        order: [['created_at', 'DESC']],
        offset: keepCount
      });

      if (autoSaves.length > 0) {
        await PageVersion.destroy({
          where: {
            id: autoSaves.map(v => v.id)
          }
        });

        logger.info('Cleaned up auto-saves', {
          pageId,
          deletedCount: autoSaves.length
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup auto-saves', { error: error.message, pageId });
      // Don't throw - this is a cleanup operation
    }
  }
}

module.exports = new PageService();
