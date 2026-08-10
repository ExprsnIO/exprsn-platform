/**
 * ═══════════════════════════════════════════════════════════════════════
 * Album Service - Album Management
 * ═══════════════════════════════════════════════════════════════════════
 */

const Album = require('../models/Album');
const Media = require('../models/Media');
const { query } = require('../config/database');
const logger = require('../utils/logger');
const timelineService = require('./timelineService');

class AlbumService {
  /**
   * Create a new album
   */
  async createAlbum(data, userId) {
    try {
      const album = await Album.create({
        ownerId: userId,
        ...data
      });

      logger.info('Album created', {
        albumId: album.id,
        userId,
        name: album.name
      });

      return album;
    } catch (error) {
      logger.error('Failed to create album:', error);
      throw error;
    }
  }

  /**
   * Get album with media
   */
  async getAlbumWithMedia(albumId, options = {}) {
    const album = await Album.findById(albumId);

    if (!album) {
      return null;
    }

    const media = await Media.findByAlbum(albumId, {
      limit: options.mediaLimit || 100,
      offset: options.mediaOffset || 0,
      status: 'ready'
    });

    return {
      ...album,
      media
    };
  }

  /**
   * Update album
   */
  async updateAlbum(albumId, data, userId) {
    const album = await Album.findById(albumId);

    if (!album) {
      throw new Error('Album not found');
    }

    if (album.owner_id !== userId) {
      throw new Error('Not authorized to update this album');
    }

    const updated = await Album.update(albumId, data);

    // Optionally sync with timeline
    await timelineService.syncAlbumPosts(albumId);

    logger.info('Album updated', {
      albumId,
      userId
    });

    return updated;
  }

  /**
   * Delete album
   */
  async deleteAlbum(albumId, userId) {
    const album = await Album.findById(albumId);

    if (!album) {
      throw new Error('Album not found');
    }

    if (album.owner_id !== userId) {
      throw new Error('Not authorized to delete this album');
    }

    await Album.delete(albumId);

    logger.info('Album deleted', {
      albumId,
      userId
    });

    return true;
  }

  /**
   * Check album access for user
   */
  async checkAccess(albumId, userId, requiredAccess = 'read') {
    const album = await Album.findById(albumId);

    if (!album) {
      return { hasAccess: false, reason: 'Album not found' };
    }

    // Owner has full access
    if (album.owner_id === userId) {
      return { hasAccess: true, isOwner: true, role: 'owner' };
    }

    // Public albums allow read access
    if (requiredAccess === 'read' && album.visibility === 'public') {
      return { hasAccess: true, isOwner: false, role: 'public' };
    }

    // Check contributors
    const contributor = await this.getContributorRole(albumId, userId);
    if (contributor) {
      const hasPermission = this._checkRolePermission(contributor.role, requiredAccess);
      return {
        hasAccess: hasPermission,
        isOwner: false,
        role: contributor.role,
        contributor
      };
    }

    return { hasAccess: false, reason: 'Access denied' };
  }

  /**
   * Add contributor to album
   * @param {string} albumId - Album ID
   * @param {string} userId - User ID to add
   * @param {string} role - Role (owner, editor, viewer)
   * @param {string} addedBy - User adding the contributor
   * @returns {Promise<Object>}
   */
  async addContributor(albumId, userId, role = 'viewer', addedBy) {
    // Validate role
    const validRoles = ['owner', 'editor', 'viewer'];
    if (!validRoles.includes(role)) {
      throw new Error('Invalid role. Must be: owner, editor, or viewer');
    }

    // Check if user is owner or has edit permissions
    const access = await this.checkAccess(albumId, addedBy, 'write');
    if (!access.hasAccess || (!access.isOwner && access.role !== 'editor')) {
      throw new Error('Not authorized to add contributors');
    }

    // Check if already a contributor
    const existing = await this.getContributorRole(albumId, userId);
    if (existing) {
      throw new Error('User is already a contributor');
    }

    const sql = `
      INSERT INTO album_contributors (album_id, user_id, role, added_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await query(sql, [albumId, userId, role, addedBy]);

    logger.info('Contributor added to album', {
      albumId,
      userId,
      role,
      addedBy
    });

    // Send notification via Herald service
    const heraldService = require('./heraldService');
    const Album = require('../models/Album');

    try {
      const album = await Album.findById(albumId);
      if (album) {
        await heraldService.notifyContributorAdded(userId, album, addedBy, role);
      }
    } catch (error) {
      logger.error('Failed to send contributor notification', {
        error: error.message,
        albumId,
        userId
      });
      // Don't fail the operation if notification fails
    }

    return result.rows[0];
  }

  /**
   * Remove contributor from album
   * @param {string} albumId - Album ID
   * @param {string} userId - User ID to remove
   * @param {string} removedBy - User removing the contributor
   * @returns {Promise<boolean>}
   */
  async removeContributor(albumId, userId, removedBy) {
    // Check if user is owner
    const album = await Album.findById(albumId);
    if (!album) {
      throw new Error('Album not found');
    }

    if (album.owner_id !== removedBy) {
      throw new Error('Only album owner can remove contributors');
    }

    // Cannot remove the owner
    if (userId === album.owner_id) {
      throw new Error('Cannot remove album owner');
    }

    const sql = `
      DELETE FROM album_contributors
      WHERE album_id = $1 AND user_id = $2
      RETURNING id
    `;

    const result = await query(sql, [albumId, userId]);

    if (result.rows.length === 0) {
      throw new Error('Contributor not found');
    }

    logger.info('Contributor removed from album', {
      albumId,
      userId,
      removedBy
    });

    return true;
  }

  /**
   * Update contributor role
   * @param {string} albumId - Album ID
   * @param {string} userId - User ID
   * @param {string} newRole - New role
   * @param {string} updatedBy - User updating the role
   * @returns {Promise<Object>}
   */
  async updateContributorRole(albumId, userId, newRole, updatedBy) {
    // Validate role
    const validRoles = ['owner', 'editor', 'viewer'];
    if (!validRoles.includes(newRole)) {
      throw new Error('Invalid role. Must be: owner, editor, or viewer');
    }

    // Check if user is owner
    const album = await Album.findById(albumId);
    if (!album) {
      throw new Error('Album not found');
    }

    if (album.owner_id !== updatedBy) {
      throw new Error('Only album owner can update contributor roles');
    }

    // Cannot change owner's role
    if (userId === album.owner_id) {
      throw new Error('Cannot change owner role');
    }

    const sql = `
      UPDATE album_contributors
      SET role = $1
      WHERE album_id = $2 AND user_id = $3
      RETURNING *
    `;

    const result = await query(sql, [newRole, albumId, userId]);

    if (result.rows.length === 0) {
      throw new Error('Contributor not found');
    }

    logger.info('Contributor role updated', {
      albumId,
      userId,
      newRole,
      updatedBy
    });

    return result.rows[0];
  }

  /**
   * Get all contributors for album
   * @param {string} albumId - Album ID
   * @returns {Promise<Array>}
   */
  async getContributors(albumId) {
    const sql = `
      SELECT
        ac.*,
        u.username,
        u.email,
        p.display_name,
        p.avatar_url
      FROM album_contributors ac
      LEFT JOIN users u ON ac.user_id = u.id
      LEFT JOIN profiles p ON ac.user_id = p.user_id AND p.is_primary = true
      WHERE ac.album_id = $1
      ORDER BY
        CASE ac.role
          WHEN 'owner' THEN 1
          WHEN 'editor' THEN 2
          WHEN 'viewer' THEN 3
        END,
        ac.added_at DESC
    `;

    const result = await query(sql, [albumId]);
    return result.rows;
  }

  /**
   * Get contributor role for specific user
   * @param {string} albumId - Album ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>}
   */
  async getContributorRole(albumId, userId) {
    const sql = `
      SELECT * FROM album_contributors
      WHERE album_id = $1 AND user_id = $2
    `;

    const result = await query(sql, [albumId, userId]);
    return result.rows[0] || null;
  }

  /**
   * Get albums where user is a contributor
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async getContributorAlbums(userId, options = {}) {
    const { limit = 50, offset = 0, role = null } = options;

    let sql = `
      SELECT
        a.*,
        ac.role as contributor_role,
        ac.added_at as joined_at,
        u.username as owner_username
      FROM album_contributors ac
      JOIN albums a ON ac.album_id = a.id
      LEFT JOIN users u ON a.owner_id = u.id
      WHERE ac.user_id = $1 AND a.deleted_at IS NULL
    `;

    const values = [userId];

    if (role) {
      sql += ` AND ac.role = $${values.length + 1}`;
      values.push(role);
    }

    sql += ` ORDER BY ac.added_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await query(sql, values);
    return result.rows;
  }

  /**
   * Check if role has required permission
   * @private
   * @param {string} role - User's role
   * @param {string} requiredAccess - Required access level
   * @returns {boolean}
   */
  _checkRolePermission(role, requiredAccess) {
    const permissions = {
      owner: ['read', 'write', 'update', 'delete', 'manage'],
      editor: ['read', 'write', 'update'],
      viewer: ['read']
    };

    const rolePermissions = permissions[role] || [];
    return rolePermissions.includes(requiredAccess);
  }
}

const albumService = new AlbumService();

module.exports = albumService;
