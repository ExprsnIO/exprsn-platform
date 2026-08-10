/**
 * ═══════════════════════════════════════════════════════════════════════
 * ShareLink Model
 * ═══════════════════════════════════════════════════════════════════════
 */

const { query } = require('../config/database');
const crypto = require('crypto');

class ShareLink {
  /**
   * Create a new share link
   */
  static async create(data) {
    const {
      albumId,
      caTokenId,
      createdBy,
      shareCode = ShareLink.generateShareCode(),
      passwordHash = null,
      maxViews = null,
      allowDownload = true,
      allowUpload = false,
      expiresAt = null
    } = data;

    const sql = `
      INSERT INTO share_links (
        album_id, ca_token_id, created_by, share_code, password_hash,
        max_views, allow_download, allow_upload, expires_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
      RETURNING *
    `;

    const values = [
      albumId, caTokenId, createdBy, shareCode, passwordHash,
      maxViews, allowDownload, allowUpload, expiresAt
    ];

    const result = await query(sql, values);
    return result.rows[0];
  }

  /**
   * Find share link by ID
   */
  static async findById(id) {
    const sql = 'SELECT * FROM share_links WHERE id = $1';
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find share link by share code
   */
  static async findByShareCode(shareCode) {
    const sql = 'SELECT * FROM share_links WHERE share_code = $1';
    const result = await query(sql, [shareCode]);
    return result.rows[0] || null;
  }

  /**
   * Find share links by album
   */
  static async findByAlbum(albumId, options = {}) {
    const { includeExpired = false } = options;

    let sql = 'SELECT * FROM share_links WHERE album_id = $1';

    if (!includeExpired) {
      sql += ' AND status = \'active\' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)';
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query(sql, [albumId]);
    return result.rows;
  }

  /**
   * Increment view count
   */
  static async incrementViewCount(id) {
    const sql = `
      UPDATE share_links
      SET view_count = view_count + 1
      WHERE id = $1
      RETURNING view_count, max_views
    `;

    const result = await query(sql, [id]);
    const link = result.rows[0];

    // Check if max views reached
    if (link && link.max_views && link.view_count >= link.max_views) {
      await ShareLink.updateStatus(id, 'expired');
    }

    return link?.view_count || 0;
  }

  /**
   * Update status
   */
  static async updateStatus(id, status) {
    const sql = `
      UPDATE share_links
      SET status = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await query(sql, [status, id]);
    return result.rows[0] || null;
  }

  /**
   * Revoke share link
   */
  static async revoke(id, revokedBy, reason = null) {
    const sql = `
      UPDATE share_links
      SET status = 'revoked',
          revoked_at = CURRENT_TIMESTAMP,
          revoked_by = $1,
          revoked_reason = $2
      WHERE id = $3
      RETURNING *
    `;

    const result = await query(sql, [revokedBy, reason, id]);
    return result.rows[0] || null;
  }

  /**
   * Check if share link is valid
   */
  static async isValid(shareCode) {
    const link = await ShareLink.findByShareCode(shareCode);

    if (!link) {
      return { valid: false, reason: 'NOT_FOUND' };
    }

    if (link.status !== 'active') {
      return { valid: false, reason: 'INACTIVE', link };
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      await ShareLink.updateStatus(link.id, 'expired');
      return { valid: false, reason: 'EXPIRED', link };
    }

    if (link.max_views && link.view_count >= link.max_views) {
      await ShareLink.updateStatus(link.id, 'expired');
      return { valid: false, reason: 'MAX_VIEWS_REACHED', link };
    }

    return { valid: true, link };
  }

  /**
   * Generate a random share code
   */
  static generateShareCode() {
    return crypto.randomBytes(16).toString('base64url');
  }

  /**
   * Get active share links for user
   */
  static async getActiveByUser(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const sql = `
      SELECT sl.*, a.name as album_name
      FROM share_links sl
      JOIN albums a ON sl.album_id = a.id
      WHERE sl.created_by = $1
        AND sl.status = 'active'
        AND (sl.expires_at IS NULL OR sl.expires_at > CURRENT_TIMESTAMP)
      ORDER BY sl.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [userId, limit, offset]);
    return result.rows;
  }
}

module.exports = ShareLink;
