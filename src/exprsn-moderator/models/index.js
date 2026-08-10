/**
 * ═══════════════════════════════════════════════════════════
 * Database Models
 * PostgreSQL database models for moderation service
 * ═══════════════════════════════════════════════════════════
 */

const { Pool } = require('pg');
const config = require('../config/database');
const logger = require('../src/utils/logger');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Create connection pool
const pool = new Pool({
  user: dbConfig.username,
  host: dbConfig.host,
  database: dbConfig.database,
  password: dbConfig.password,
  port: dbConfig.port,
  max: dbConfig.pool?.max || 10,
  min: dbConfig.pool?.min || 2,
  idleTimeoutMillis: dbConfig.pool?.idle || 10000,
  connectionTimeoutMillis: dbConfig.pool?.acquire || 30000
});

// Test connection
pool.on('connect', () => {
  logger.info('Database connected');
});

pool.on('error', (err) => {
  logger.error('Unexpected database error', { error: err.message });
});

/**
 * Base Model class
 */
class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
    this.pool = pool;
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      logger.error('Query error', { error: error.message, text });
      throw error;
    }
  }

  async findByPk(id) {
    const res = await this.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async findOne(where) {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');

    const res = await this.query(
      `SELECT * FROM ${this.tableName} WHERE ${conditions} LIMIT 1`,
      values
    );
    return res.rows[0] || null;
  }

  async findAll(options = {}) {
    let query = `SELECT * FROM ${this.tableName}`;
    const params = [];
    let paramCount = 0;

    if (options.where) {
      const keys = Object.keys(options.where);
      const values = Object.values(options.where);
      const conditions = keys.map((key, i) => `${key} = $${++paramCount}`).join(' AND ');
      query += ` WHERE ${conditions}`;
      params.push(...values);
    }

    if (options.order) {
      const orderClauses = options.order.map(([field, direction]) => `${field} ${direction}`).join(', ');
      query += ` ORDER BY ${orderClauses}`;
    }

    if (options.limit) {
      query += ` LIMIT $${++paramCount}`;
      params.push(options.limit);
    }

    if (options.offset) {
      query += ` OFFSET $${++paramCount}`;
      params.push(options.offset);
    }

    const res = await this.query(query, params);
    return res.rows;
  }

  async create(data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.join(', ');

    const res = await this.query(
      `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return res.rows[0];
  }

  async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClauses = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

    const res = await this.query(
      `UPDATE ${this.tableName} SET ${setClauses} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id]
    );
    return res.rows[0];
  }

  async delete(id) {
    await this.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
  }

  async count(where = {}) {
    let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const params = [];

    if (Object.keys(where).length > 0) {
      const keys = Object.keys(where);
      const values = Object.values(where);
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      query += ` WHERE ${conditions}`;
      params.push(...values);
    }

    const res = await this.query(query, params);
    return parseInt(res.rows[0].count);
  }
}

/**
 * ModerationItem Model
 */
class ModerationItemModel extends BaseModel {
  constructor() {
    super('moderation_items');
  }

  async findByContent(sourceService, contentType, contentId) {
    return await this.findOne({
      source_service: sourceService,
      content_type: contentType,
      content_id: contentId
    });
  }

  async create(data) {
    // Convert camelCase to snake_case for database
    const dbData = {
      content_type: data.contentType,
      content_id: data.contentId,
      source_service: data.sourceService,
      user_id: data.userId,
      content_text: data.contentText,
      content_url: data.contentUrl,
      content_metadata: JSON.stringify(data.contentMetadata || {}),
      risk_score: data.riskScore,
      risk_level: data.riskLevel,
      toxicity_score: data.toxicityScore,
      nsfw_score: data.nsfwScore,
      spam_score: data.spamScore,
      violence_score: data.violenceScore,
      hate_speech_score: data.hateSpeechScore,
      ai_provider: data.aiProvider,
      ai_model: data.aiModel,
      ai_response: JSON.stringify(data.aiResponse || {}),
      status: data.status,
      action: data.action,
      requires_review: data.requiresReview,
      reviewed_by: data.reviewedBy,
      reviewed_at: data.reviewedAt,
      review_notes: data.reviewNotes,
      submitted_at: data.submittedAt,
      processed_at: data.processedAt
    };

    const result = await super.create(dbData);
    return this._toCamelCase(result);
  }

  async update(id, data) {
    const dbData = {};

    if (data.status) dbData.status = data.status;
    if (data.action) dbData.action = data.action;
    if (data.reviewedBy) dbData.reviewed_by = data.reviewedBy;
    if (data.reviewedAt) dbData.reviewed_at = data.reviewedAt;
    if (data.reviewNotes) dbData.review_notes = data.reviewNotes;

    const result = await super.update(id, dbData);
    return this._toCamelCase(result);
  }

  _toCamelCase(row) {
    if (!row) return null;

    return {
      id: row.id,
      contentType: row.content_type,
      contentId: row.content_id,
      sourceService: row.source_service,
      userId: row.user_id,
      contentText: row.content_text,
      contentUrl: row.content_url,
      contentMetadata: row.content_metadata,
      riskScore: row.risk_score,
      riskLevel: row.risk_level,
      toxicityScore: row.toxicity_score,
      nsfwScore: row.nsfw_score,
      spamScore: row.spam_score,
      violenceScore: row.violence_score,
      hateSpeechScore: row.hate_speech_score,
      aiProvider: row.ai_provider,
      aiModel: row.ai_model,
      aiResponse: row.ai_response,
      status: row.status,
      action: row.action,
      requiresReview: row.requires_review,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      reviewNotes: row.review_notes,
      submittedAt: row.submitted_at,
      processedAt: row.processed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

/**
 * ReviewQueue Model
 */
class ReviewQueueModel extends BaseModel {
  constructor() {
    super('review_queue');
  }

  async create(data) {
    const dbData = {
      moderation_item_id: data.moderationItemId,
      priority: data.priority,
      escalated: data.escalated,
      escalated_reason: data.escalatedReason,
      assigned_to: data.assignedTo,
      assigned_at: data.assignedAt,
      status: data.status,
      queued_at: data.queuedAt,
      completed_at: data.completedAt
    };

    return await super.create(dbData);
  }

  async findAll(options = {}) {
    const rows = await super.findAll(options);

    if (options.include) {
      // Simple join simulation
      for (const row of rows) {
        if (row.moderation_item_id) {
          row.moderationItem = await ModerationItem.findByPk(row.moderation_item_id);
        }
      }
    }

    return rows;
  }
}

/**
 * ModerationAction Model
 */
class ModerationActionModel extends BaseModel {
  constructor() {
    super('moderation_actions');
  }

  async create(data) {
    const dbData = {
      action: data.action,
      content_type: data.contentType,
      content_id: data.contentId,
      source_service: data.sourceService,
      performed_by: data.performedBy,
      is_automated: data.isAutomated,
      reason: data.reason,
      moderation_item_id: data.moderationItemId,
      report_id: data.reportId,
      metadata: JSON.stringify(data.metadata || {}),
      performed_at: data.performedAt
    };

    return await super.create(dbData);
  }
}

/**
 * ModerationRule Model
 */
class ModerationRuleModel extends BaseModel {
  constructor() {
    super('moderation_rules');
  }

  async findAll(options = {}) {
    const rows = await super.findAll(options);

    return rows.map(row => ({
      ...row,
      appliesToArray: row.applies_to,
      sourceServicesArray: row.source_services
    }));
  }
}

/**
 * Report Model
 */
class ReportModel extends BaseModel {
  constructor() {
    super('reports');
  }

  async create(data) {
    const dbData = {
      content_type: data.contentType,
      content_id: data.contentId,
      source_service: data.sourceService,
      reported_by: data.reportedBy,
      reason: data.reason,
      details: data.details,
      status: data.status || 'open'
    };

    return await super.create(dbData);
  }
}

/**
 * UserAction Model
 */
class UserActionModel extends BaseModel {
  constructor() {
    super('user_actions');
  }

  async create(data) {
    const dbData = {
      user_id: data.userId,
      action_type: data.actionType,
      reason: data.reason,
      duration_seconds: data.durationSeconds,
      expires_at: data.expiresAt,
      performed_by: data.performedBy,
      related_content_id: data.relatedContentId,
      related_report_id: data.relatedReportId,
      active: data.active !== undefined ? data.active : true,
      performed_at: data.performedAt || Date.now()
    };

    return await super.create(dbData);
  }

  async getActiveActions(userId) {
    const now = Date.now();
    const res = await this.query(
      `SELECT * FROM ${this.tableName}
       WHERE user_id = $1
         AND active = true
         AND (expires_at IS NULL OR expires_at > $2)
       ORDER BY performed_at DESC`,
      [userId, now]
    );
    return res.rows;
  }
}

/**
 * Appeal Model
 */
class AppealModel extends BaseModel {
  constructor() {
    super('appeals');
  }

  async create(data) {
    const dbData = {
      moderation_item_id: data.moderationItemId,
      user_action_id: data.userActionId,
      user_id: data.userId,
      reason: data.reason,
      additional_info: data.additionalInfo,
      status: data.status || 'pending',
      submitted_at: data.submittedAt || Date.now()
    };

    return await super.create(dbData);
  }
}

// Export model instances
module.exports = {
  pool,
  ModerationItem: new ModerationItemModel(),
  ReviewQueue: new ReviewQueueModel(),
  ModerationAction: new ModerationActionModel(),
  ModerationRule: new ModerationRuleModel(),
  Report: new ReportModel(),
  UserAction: new UserActionModel(),
  Appeal: new AppealModel()
};
