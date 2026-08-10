/**
 * ═══════════════════════════════════════════════════════════════════════
 * Media Model
 * ═══════════════════════════════════════════════════════════════════════
 */

const { query, getClient } = require('../config/database');
const logger = require('../utils/logger');

class Media {
  /**
   * Create a new media item
   */
  static async create(data) {
    const {
      albumId,
      uploaderId,
      filename,
      originalFilename,
      mediaType,
      mimetype,
      size,
      filevaultFileId = null,
      storagePath = null,
      storageBackend = 'local',
      width = null,
      height = null,
      duration = null,
      status = 'uploading',
      thumbnails = [],
      videoFormats = null,
      exifData = null,
      metadata = {},
      title = null,
      description = null,
      caption = null,
      altText = null,
      tags = [],
      takenAt = null,
      locationName = null,
      locationLat = null,
      locationLon = null,
      sortOrder = 0,
      contentHash = null
    } = data;

    const sql = `
      INSERT INTO media (
        album_id, uploader_id, filename, original_filename, media_type,
        mimetype, size, filevault_file_id, storage_path, storage_backend,
        width, height, duration, status, thumbnails, video_formats,
        exif_data, metadata, title, description, caption, alt_text,
        tags, taken_at, location_name, location_lat, location_lon,
        sort_order, content_hash
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29
      )
      RETURNING *
    `;

    const values = [
      albumId, uploaderId, filename, originalFilename, mediaType,
      mimetype, size, filevaultFileId, storagePath, storageBackend,
      width, height, duration, status, JSON.stringify(thumbnails),
      videoFormats ? JSON.stringify(videoFormats) : null,
      exifData ? JSON.stringify(exifData) : null,
      JSON.stringify(metadata), title, description, caption, altText,
      tags, takenAt, locationName, locationLat, locationLon,
      sortOrder, contentHash
    ];

    const result = await query(sql, values);
    return result.rows[0];
  }

  /**
   * Find media by ID
   */
  static async findById(id) {
    const sql = 'SELECT * FROM media WHERE id = $1 AND deleted_at IS NULL';
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find media by album
   */
  static async findByAlbum(albumId, options = {}) {
    const { limit = 100, offset = 0, status = null } = options;

    let sql = 'SELECT * FROM media WHERE album_id = $1 AND deleted_at IS NULL';
    const values = [albumId];

    if (status) {
      sql += ' AND status = $2';
      values.push(status);
    }

    sql += ' ORDER BY sort_order ASC, created_at DESC LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2);
    values.push(limit, offset);

    const result = await query(sql, values);
    return result.rows;
  }

  /**
   * Find media by content hash (for deduplication)
   */
  static async findByContentHash(contentHash) {
    const sql = 'SELECT * FROM media WHERE content_hash = $1 AND deleted_at IS NULL LIMIT 1';
    const result = await query(sql, [contentHash]);
    return result.rows[0] || null;
  }

  /**
   * Update media
   */
  static async update(id, data) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    const allowedFields = [
      'filename', 'status', 'processing_error', 'thumbnails', 'video_formats',
      'width', 'height', 'duration', 'exif_data', 'metadata',
      'title', 'description', 'caption', 'alt_text', 'tags',
      'taken_at', 'location_name', 'location_lat', 'location_lon',
      'sort_order', 'is_album_cover', 'detected_faces', 'ai_tags'
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        const dbField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
        fields.push(`${dbField} = $${paramCount++}`);

        // Handle JSON fields
        if (['thumbnails', 'video_formats', 'exif_data', 'metadata', 'detected_faces'].includes(field)) {
          values.push(JSON.stringify(data[field]));
        } else {
          values.push(data[field]);
        }
      }
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);
    const sql = `
      UPDATE media
      SET ${fields.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await query(sql, values);
    return result.rows[0] || null;
  }

  /**
   * Update processing status
   */
  static async updateStatus(id, status, error = null) {
    const sql = `
      UPDATE media
      SET status = $1, processing_error = $2
      WHERE id = $3
      RETURNING *
    `;

    const result = await query(sql, [status, error, id]);
    return result.rows[0] || null;
  }

  /**
   * Delete media (soft delete)
   */
  static async delete(id) {
    const sql = `
      UPDATE media
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
      UPDATE media
      SET view_count = view_count + 1
      WHERE id = $1
      RETURNING view_count
    `;

    const result = await query(sql, [id]);
    return result.rows[0]?.view_count || 0;
  }

  /**
   * Increment download count
   */
  static async incrementDownloadCount(id) {
    const sql = `
      UPDATE media
      SET download_count = download_count + 1
      WHERE id = $1
      RETURNING download_count
    `;

    const result = await query(sql, [id]);
    return result.rows[0]?.download_count || 0;
  }

  /**
   * Get media with album info
   */
  static async getWithAlbum(id) {
    const sql = `
      SELECT m.*, a.name as album_name, a.owner_id as album_owner_id,
        a.visibility as album_visibility
      FROM media m
      JOIN albums a ON m.album_id = a.id
      WHERE m.id = $1 AND m.deleted_at IS NULL AND a.deleted_at IS NULL
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Search media
   */
  static async search(searchTerm, options = {}) {
    const { limit = 50, offset = 0, mediaType = null } = options;

    let sql = `
      SELECT m.*, a.name as album_name
      FROM media m
      JOIN albums a ON m.album_id = a.id
      WHERE m.deleted_at IS NULL AND a.deleted_at IS NULL
        AND (
          m.title ILIKE $1
          OR m.description ILIKE $1
          OR m.caption ILIKE $1
          OR $2 = ANY(m.tags)
          OR $2 = ANY(m.ai_tags)
        )
    `;

    const values = [`%${searchTerm}%`, searchTerm];

    if (mediaType) {
      sql += ' AND m.media_type = $3';
      values.push(mediaType);
    }

    sql += ' ORDER BY m.created_at DESC LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2);
    values.push(limit, offset);

    const result = await query(sql, values);
    return result.rows;
  }

  /**
   * Find media by location
   */
  static async findByLocation(lat, lon, radiusKm = 10, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const sql = `
      SELECT *,
        (
          6371 * acos(
            cos(radians($1)) * cos(radians(location_lat)) *
            cos(radians(location_lon) - radians($2)) +
            sin(radians($1)) * sin(radians(location_lat))
          )
        ) AS distance_km
      FROM media
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
   * Get recent media for user
   */
  static async getRecentByUser(uploaderId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const sql = `
      SELECT * FROM media
      WHERE uploader_id = $1 AND deleted_at IS NULL AND status = 'ready'
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [uploaderId, limit, offset]);
    return result.rows;
  }

  /**
   * Reorder media in album
   */
  static async reorder(mediaIds) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      for (let i = 0; i < mediaIds.length; i++) {
        await client.query(
          'UPDATE media SET sort_order = $1 WHERE id = $2',
          [i, mediaIds[i]]
        );
      }

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error reordering media:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = Media;
