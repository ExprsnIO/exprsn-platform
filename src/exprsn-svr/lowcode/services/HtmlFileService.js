/**
 * ═══════════════════════════════════════════════════════════
 * HTML File Service
 * File and folder management for HTML projects
 * ═══════════════════════════════════════════════════════════
 */

const { Op } = require('sequelize');
const models = require('../models');
const logger = require('../utils/logger');
const path = require('path');

class HtmlFileService {
  /**
   * Get file tree for a project
   */
  static async getFileTree(projectId) {
    try {
      const files = await models.HtmlFile.findAll({
        where: { projectId },
        order: [['order', 'ASC'], ['name', 'ASC']]
      });

      // Build tree structure
      const tree = this._buildTree(files, null);

      return {
        success: true,
        data: tree
      };
    } catch (error) {
      logger.error('Error fetching file tree:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Get single file by ID
   */
  static async getFile(fileId, options = {}) {
    try {
      const include = [];

      if (options.includeVersions) {
        include.push({
          model: models.HtmlFileVersion,
          as: 'versions',
          limit: options.versionLimit || 10,
          order: [['versionNumber', 'DESC']]
        });
      }

      const file = await models.HtmlFile.findByPk(fileId, { include });

      if (!file) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'File not found'
        };
      }

      return {
        success: true,
        data: file
      };
    } catch (error) {
      logger.error('Error fetching file:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Create file or folder
   */
  static async createFile(data) {
    try {
      const { projectId, parentId, name, type, content, userId } = data;

      // Build path
      let filePath = `/${name}`;
      if (parentId) {
        const parent = await models.HtmlFile.findByPk(parentId);
        if (!parent) {
          return { success: false, error: 'PARENT_NOT_FOUND', message: 'Parent folder not found' };
        }
        filePath = `${parent.path}/${name}`;
      }

      // Check for duplicate path
      const existing = await models.HtmlFile.findOne({
        where: { projectId, path: filePath }
      });

      if (existing) {
        return { success: false, error: 'DUPLICATE_PATH', message: 'File already exists at this path' };
      }

      const file = await models.HtmlFile.create({
        projectId,
        parentId,
        name,
        path: filePath,
        type,
        content: content || '',
        createdBy: userId,
        updatedBy: userId
      });

      // Create initial version if not a folder
      if (type !== 'folder') {
        await this.createVersion(file.id, userId, 'Initial version');
      }

      logger.info(`File created: ${file.id}`, { fileId: file.id, projectId });

      return {
        success: true,
        data: file
      };
    } catch (error) {
      logger.error('Error creating file:', error);
      return {
        success: false,
        error: 'CREATION_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Update file content
   */
  static async updateFile(fileId, updates, userId) {
    try {
      const file = await models.HtmlFile.findByPk(fileId);

      if (!file) {
        return { success: false, error: 'NOT_FOUND', message: 'File not found' };
      }

      if (file.type === 'folder') {
        return { success: false, error: 'INVALID_OPERATION', message: 'Cannot update folder content' };
      }

      const oldContent = file.content;

      // Update file
      await file.update({
        ...updates,
        updatedBy: userId
      });

      // Create new version if content changed
      if (updates.content && updates.content !== oldContent) {
        await this.createVersion(fileId, userId, 'Content updated');
      }

      logger.info(`File updated: ${fileId}`, { fileId });

      return {
        success: true,
        data: file
      };
    } catch (error) {
      logger.error('Error updating file:', error);
      return {
        success: false,
        error: 'UPDATE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Delete file or folder
   */
  static async deleteFile(fileId) {
    try {
      const file = await models.HtmlFile.findByPk(fileId);

      if (!file) {
        return { success: false, error: 'NOT_FOUND', message: 'File not found' };
      }

      // If folder, delete all children recursively
      if (file.type === 'folder') {
        await this._deleteFolder(fileId);
      }

      await file.destroy();

      logger.info(`File deleted: ${fileId}`, { fileId });

      return {
        success: true,
        message: 'File deleted successfully'
      };
    } catch (error) {
      logger.error('Error deleting file:', error);
      return {
        success: false,
        error: 'DELETE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Move file to new location
   */
  static async moveFile(fileId, newParentId, userId) {
    try {
      const file = await models.HtmlFile.findByPk(fileId);

      if (!file) {
        return { success: false, error: 'NOT_FOUND', message: 'File not found' };
      }

      // Build new path
      let newPath;
      if (newParentId) {
        const parent = await models.HtmlFile.findByPk(newParentId);
        if (!parent || parent.type !== 'folder') {
          return { success: false, error: 'INVALID_PARENT', message: 'Invalid parent folder' };
        }
        newPath = `${parent.path}/${file.name}`;
      } else {
        newPath = `/${file.name}`;
      }

      await file.update({
        parentId: newParentId,
        path: newPath,
        updatedBy: userId
      });

      // Update paths for all descendants if this is a folder
      if (file.type === 'folder') {
        await this._updateDescendantPaths(fileId, newPath);
      }

      return {
        success: true,
        data: file
      };
    } catch (error) {
      logger.error('Error moving file:', error);
      return {
        success: false,
        error: 'MOVE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Create file version
   */
  static async createVersion(fileId, userId, description = null) {
    try {
      const file = await models.HtmlFile.findByPk(fileId);

      if (!file) {
        return { success: false, error: 'NOT_FOUND', message: 'File not found' };
      }

      // Get latest version number
      const latestVersion = await models.HtmlFileVersion.findOne({
        where: { fileId },
        order: [['versionNumber', 'DESC']]
      });

      const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

      const version = await models.HtmlFileVersion.create({
        fileId,
        versionNumber,
        content: file.content,
        storagePath: file.storagePath,
        changeDescription: description,
        createdBy: userId
      });

      return {
        success: true,
        data: version
      };
    } catch (error) {
      logger.error('Error creating file version:', error);
      return {
        success: false,
        error: 'VERSION_CREATE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Restore file to specific version
   */
  static async restoreVersion(fileId, versionNumber, userId) {
    try {
      const version = await models.HtmlFileVersion.findOne({
        where: { fileId, versionNumber }
      });

      if (!version) {
        return { success: false, error: 'VERSION_NOT_FOUND', message: 'Version not found' };
      }

      const file = await models.HtmlFile.findByPk(fileId);

      await file.update({
        content: version.content,
        storagePath: version.storagePath,
        updatedBy: userId
      });

      // Create new version for the restore
      await this.createVersion(fileId, userId, `Restored from version ${versionNumber}`);

      return {
        success: true,
        data: file
      };
    } catch (error) {
      logger.error('Error restoring file version:', error);
      return {
        success: false,
        error: 'RESTORE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * PRIVATE: Build tree structure from flat file list
   */
  static _buildTree(files, parentId) {
    return files
      .filter(f => f.parentId === parentId)
      .map(file => ({
        ...file.toJSON(),
        children: file.type === 'folder' ? this._buildTree(files, file.id) : []
      }));
  }

  /**
   * PRIVATE: Recursively delete folder contents
   */
  static async _deleteFolder(folderId) {
    const children = await models.HtmlFile.findAll({
      where: { parentId: folderId }
    });

    for (const child of children) {
      if (child.type === 'folder') {
        await this._deleteFolder(child.id);
      }
      await child.destroy();
    }
  }

  /**
   * PRIVATE: Update paths for all descendants when folder is moved
   */
  static async _updateDescendantPaths(folderId, newBasePath) {
    const children = await models.HtmlFile.findAll({
      where: { parentId: folderId }
    });

    for (const child of children) {
      const newPath = `${newBasePath}/${child.name}`;
      await child.update({ path: newPath });

      if (child.type === 'folder') {
        await this._updateDescendantPaths(child.id, newPath);
      }
    }
  }
}

module.exports = HtmlFileService;
