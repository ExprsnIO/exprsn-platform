/**
 * ═══════════════════════════════════════════════════════════
 * PageAnalytics Model
 * Track page views, interactions, and user behavior
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class PageAnalytics extends Model {
  /**
   * Get analytics summary for a page
   */
  static async getPageStats(pageId, startDate, endDate) {
    const where = { page_id: pageId };

    if (startDate) {
      where.created_at = { [DataTypes.Op.gte]: startDate };
    }
    if (endDate) {
      where.created_at = { ...where.created_at, [DataTypes.Op.lte]: endDate };
    }

    const stats = await this.findAll({
      where,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total_views'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('visitor_id'))), 'unique_visitors'],
        [sequelize.fn('AVG', sequelize.col('time_on_page')), 'avg_time_on_page'],
        [sequelize.fn('COUNT', sequelize.literal("CASE WHEN bounce THEN 1 END")), 'bounce_count']
      ],
      raw: true
    });

    return stats[0];
  }

  /**
   * Get top referrers for a page
   */
  static async getTopReferrers(pageId, limit = 10) {
    return await this.findAll({
      where: { page_id: pageId },
      attributes: [
        'referrer',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['referrer'],
      order: [[sequelize.literal('count'), 'DESC']],
      limit,
      raw: true
    });
  }

  /**
   * Get geographic distribution
   */
  static async getGeographicStats(pageId) {
    return await this.findAll({
      where: { page_id: pageId },
      attributes: [
        'country',
        'city',
        [sequelize.fn('COUNT', sequelize.col('id')), 'views']
      ],
      group: ['country', 'city'],
      order: [[sequelize.literal('views'), 'DESC']],
      raw: true
    });
  }
}

PageAnalytics.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    page_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'Page being viewed'
    },
    visitor_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Unique visitor identifier (cookie/fingerprint)'
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Authenticated user (if logged in)'
    },
    session_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Session identifier'
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: 'Visitor IP address (anonymized)'
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Browser user agent'
    },
    browser: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Browser name'
    },
    browser_version: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    device_type: {
      type: DataTypes.ENUM('desktop', 'mobile', 'tablet', 'bot', 'other'),
      defaultValue: 'other',
      comment: 'Device type'
    },
    os: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Operating system'
    },
    os_version: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    screen_resolution: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Screen resolution (e.g., 1920x1080)'
    },
    referrer: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Referring URL'
    },
    utm_source: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'UTM source parameter'
    },
    utm_medium: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    utm_campaign: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    utm_term: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    utm_content: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Visitor country'
    },
    region: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Visitor region/state'
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Visitor city'
    },
    language: {
      type: DataTypes.STRING(10),
      allowNull: true,
      comment: 'Browser language'
    },
    time_on_page: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Time spent on page (seconds)'
    },
    scroll_depth: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Maximum scroll depth (percentage)'
    },
    bounce: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Did user bounce (leave quickly)?'
    },
    interactions: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'User interactions (clicks, form submissions, etc.)'
    },
    exit_page: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Page user navigated to on exit'
    }
  },
  {
    sequelize,
    modelName: 'PageAnalytics',
    tableName: 'page_analytics',
    indexes: [
      { fields: ['page_id'] },
      { fields: ['visitor_id'] },
      { fields: ['user_id'] },
      { fields: ['session_id'] },
      { fields: ['device_type'] },
      { fields: ['country'] },
      { fields: ['created_at'] }
    ]
  }
);

module.exports = PageAnalytics;
