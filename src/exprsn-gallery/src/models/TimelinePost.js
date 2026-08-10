/**
 * ═══════════════════════════════════════════════════════════════════════
 * TimelinePost Model - Integration with Timeline Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const { query } = require('../config/database');

class TimelinePost {
  /**
   * Create a timeline post record
   */
  static async create(data) {
    const {
      albumId = null,
      mediaId = null,
      userId,
      timelinePostId = null,
      caption = null,
      postType,
      visibility = 'public'
    } = data;

    const sql = `
      INSERT INTO timeline_posts (
        album_id, media_id, user_id, timeline_post_id,
        caption, post_type, visibility
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [albumId, mediaId, userId, timelinePostId, caption, postType, visibility];
    const result = await query(sql, values);
    return result.rows[0];
  }

  /**
   * Find timeline post by ID
   */
  static async findById(id) {
    const sql = 'SELECT * FROM timeline_posts WHERE id = $1 AND deleted_at IS NULL';
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find by timeline post ID
   */
  static async findByTimelinePostId(timelinePostId) {
    const sql = 'SELECT * FROM timeline_posts WHERE timeline_post_id = $1 AND deleted_at IS NULL';
    const result = await query(sql, [timelinePostId]);
    return result.rows[0] || null;
  }

  /**
   * Find timeline posts by user
   */
  static async findByUser(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const sql = `
      SELECT * FROM timeline_posts
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY posted_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [userId, limit, offset]);
    return result.rows;
  }

  /**
   * Find timeline posts by album
   */
  static async findByAlbum(albumId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const sql = `
      SELECT * FROM timeline_posts
      WHERE album_id = $1 AND deleted_at IS NULL
      ORDER BY posted_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [albumId, limit, offset]);
    return result.rows;
  }

  /**
   * Find timeline posts by media
   */
  static async findByMedia(mediaId) {
    const sql = `
      SELECT * FROM timeline_posts
      WHERE media_id = $1 AND deleted_at IS NULL
      ORDER BY posted_at DESC
    `;

    const result = await query(sql, [mediaId]);
    return result.rows;
  }

  /**
   * Update timeline post ID
   */
  static async updateTimelinePostId(id, timelinePostId) {
    const sql = `
      UPDATE timeline_posts
      SET timeline_post_id = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await query(sql, [timelinePostId, id]);
    return result.rows[0] || null;
  }

  /**
   * Delete timeline post (soft delete)
   */
  static async delete(id) {
    const sql = `
      UPDATE timeline_posts
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Get timeline post with media/album details
   */
  static async getWithDetails(id) {
    const sql = `
      SELECT
        tp.*,
        a.name as album_name,
        a.visibility as album_visibility,
        m.filename as media_filename,
        m.mimetype as media_mimetype,
        m.thumbnails as media_thumbnails
      FROM timeline_posts tp
      LEFT JOIN albums a ON tp.album_id = a.id
      LEFT JOIN media m ON tp.media_id = m.id
      WHERE tp.id = $1 AND tp.deleted_at IS NULL
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }
}

module.exports = TimelinePost;
