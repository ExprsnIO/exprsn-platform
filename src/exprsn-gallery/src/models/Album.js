/**
 * ═══════════════════════════════════════════════════════════════════════
 * Album Model
 * ═══════════════════════════════════════════════════════════════════════
 */

const { query, getClient } = require('../config/database');
const logger = require('../utils/logger');

class Album {
  /**
   * Create a new album
   */
  static async create(data) {
    const {
      ownerId,
      name,
      description = null,
      slug = null,
      visibility = 'private',
      passwordHash = null,
      layout = 'grid',
      tags = [],
      locationName = null,
      locationLat = null,
      locationLon = null,
      dateStart = null,
      dateEnd = null,
      settings = {}
    } = data;

    const sql = `
      INSERT INTO albums (
        owner_id, name, description, slug, visibility, password_hash,
        layout, tags, location_name, location_lat, location_lon,
        date_start, date_end, settings
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const values = [
      ownerId, name, description, slug, visibility, passwordHash,
      layout, tags, locationName, locationLat, locationLon,
      dateStart, dateEnd, JSON.stringify(settings)
    ];

    const result = await query(sql, values);
    return result.rows[0];
  }

  /**
   * Find album by ID
   */
  static async findById(id) {
    const sql = 'SELECT * FROM albums WHERE id = $1 AND deleted_at IS NULL';
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find albums by owner
   */
  static async findByOwner(ownerId, options = {}) {
    const { limit = 50, offset = 0, visibility = null } = options;

    let sql = 'SELECT * FROM albums WHERE owner_id = $1 AND deleted_at IS NULL';
    const values = [ownerId];

    if (visibility) {
      sql += ' AND visibility = $2';
      values.push(visibility);
    }

    sql += ' ORDER BY created_at DESC LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2);
    values.push(limit, offset);

    const result = await query(sql, values);
    return result.rows;
  }

  /**
   * Find album by slug
   */
  static async findBySlug(slug) {
    const sql = 'SELECT * FROM albums WHERE slug = $1 AND deleted_at IS NULL';
    const result = await query(sql, [slug]);
    return result.rows[0] || null;
  }

  /**
   * Update album
   */
  static async update(id, data) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    const allowedFields = [
      'name', 'description', 'slug', 'visibility', 'password_hash',
      'layout', 'cover_media_id', 'tags', 'location_name', 'location_lat',
      'location_lon', 'date_start', 'date_end', 'settings'
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field.replace(/([A-Z])/g, '_$1').toLowerCase()} = $${paramCount++}`);
        values.push(field === 'settings' ? JSON.stringify(data[field]) : data[field]);
      }
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);
    const sql = `
      UPDATE albums
      SET ${fields.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await query(sql, values);
    return result.rows[0] || null;
  }

  /**
   * Delete album (soft delete)
   */
  static async delete(id) {
    const sql = `
      UPDATE albums
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Increment view count
   */
  static async incrementViewCount(id) {
    const sql = `
      UPDATE albums
      SET view_count = view_count + 1
      WHERE id = $1
      RETURNING view_count
    `;

    const result = await query(sql, [id]);
    return result.rows[0]?.view_count || 0;
  }

  /**
   * Search albums
   */
  static async search(searchTerm, options = {}) {
    const { limit = 50, offset = 0, visibility = null } = options;

    let sql = `
      SELECT * FROM albums
      WHERE deleted_at IS NULL
        AND (
          name ILIKE $1
          OR description ILIKE $1
          OR $2 = ANY(tags)
        )
    `;

    const values = [`%${searchTerm}%`, searchTerm];

    if (visibility) {
      sql += ' AND visibility = $3';
      values.push(visibility);
    }

    sql += ' ORDER BY created_at DESC LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2);
    values.push(limit, offset);

    const result = await query(sql, values);
    return result.rows;
  }

  /**
   * Find albums by location (within radius)
   */
  static async findByLocation(lat, lon, radiusKm = 10, options = {}) {
    const { limit = 50, offset = 0 } = options;

    // Haversine formula for distance calculation
    const sql = `
      SELECT *,
        (
          6371 * acos(
            cos(radians($1)) * cos(radians(location_lat)) *
            cos(radians(location_lon) - radians($2)) +
            sin(radians($1)) * sin(radians(location_lat))
          )
        ) AS distance_km
      FROM albums
      WHERE deleted_at IS NULL
        AND location_lat IS NOT NULL
        AND location_lon IS NOT NULL
      HAVING distance_km <= $3
      ORDER BY distance_km
      LIMIT $4 OFFSET $5
    `;

    const result = await query(sql, [lat, lon, radiusKm, limit, offset]);
    return result.rows;
  }

  /**
   * Find albums by date range
   */
  static async findByDateRange(startDate, endDate, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const sql = `
      SELECT * FROM albums
      WHERE deleted_at IS NULL
        AND (
          (date_start >= $1 AND date_start <= $2)
          OR (date_end >= $1 AND date_end <= $2)
          OR (date_start <= $1 AND date_end >= $2)
        )
      ORDER BY date_start DESC
      LIMIT $3 OFFSET $4
    `;

    const result = await query(sql, [startDate, endDate, limit, offset]);
    return result.rows;
  }

  /**
   * Get album with statistics
   */
  static async getWithStats(id) {
    const sql = `
      SELECT
        a.*,
        COUNT(DISTINCT ac.user_id) as contributor_count,
        COUNT(DISTINCT sl.id) as share_link_count
      FROM albums a
      LEFT JOIN album_contributors ac ON a.id = ac.album_id
      LEFT JOIN share_links sl ON a.id = sl.album_id AND sl.status = 'active'
      WHERE a.id = $1 AND a.deleted_at IS NULL
      GROUP BY a.id
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Get public albums
   */
  static async getPublicAlbums(options = {}) {
    const { limit = 50, offset = 0 } = options;

    const sql = `
      SELECT * FROM albums
      WHERE visibility = 'public' AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await query(sql, [limit, offset]);
    return result.rows;
  }
}

module.exports = Album;
