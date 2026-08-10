/**
 * ═══════════════════════════════════════════════════════════════════════
 * AuditLog Model
 * ═══════════════════════════════════════════════════════════════════════
 */

const { query } = require('../config/database');

class AuditLog {
  /**
   * Create an audit log entry
   */
  static async create(data) {
    const {
      userId = null,
      action,
      resourceType,
      resourceId = null,
      details = {},
      ipAddress = null,
      userAgent = null
    } = data;

    const sql = `
      INSERT INTO audit_logs (
        user_id, action, resource_type, resource_id,
        details, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      userId, action, resourceType, resourceId,
      JSON.stringify(details), ipAddress, userAgent
    ];

    const result = await query(sql, values);
    return result.rows[0];
  }

  /**
   * Find audit logs by user
   */
  static async findByUser(userId, options = {}) {
    const { limit = 100, offset = 0, action = null } = options;

    let sql = 'SELECT * FROM audit_logs WHERE user_id = $1';
    const values = [userId];

    if (action) {
      sql += ' AND action = $2';
      values.push(action);
    }

    sql += ' ORDER BY created_at DESC LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2);
    values.push(limit, offset);

    const result = await query(sql, values);
    return result.rows;
  }

  /**
   * Find audit logs by resource
   */
  static async findByResource(resourceType, resourceId, options = {}) {
    const { limit = 100, offset = 0 } = options;

    const sql = `
      SELECT * FROM audit_logs
      WHERE resource_type = $1 AND resource_id = $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const result = await query(sql, [resourceType, resourceId, limit, offset]);
    return result.rows;
  }

  /**
   * Find audit logs by action
   */
  static async findByAction(action, options = {}) {
    const { limit = 100, offset = 0 } = options;

    const sql = `
      SELECT * FROM audit_logs
      WHERE action = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [action, limit, offset]);
    return result.rows;
  }

  /**
   * Get recent audit logs
   */
  static async getRecent(options = {}) {
    const { limit = 100, offset = 0 } = options;

    const sql = `
      SELECT * FROM audit_logs
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await query(sql, [limit, offset]);
    return result.rows;
  }
}

module.exports = AuditLog;
