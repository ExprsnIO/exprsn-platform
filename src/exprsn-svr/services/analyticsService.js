/**
 * ═══════════════════════════════════════════════════════════
 * Analytics Service
 * Business logic for page analytics and user behavior tracking
 * ═══════════════════════════════════════════════════════════
 */

const PageAnalytics = require('../models/PageAnalytics');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const crypto = require('crypto');
const UAParser = require('ua-parser-js');

class AnalyticsService {
  /**
   * Track page view
   */
  async trackPageView(pageId, request, options = {}) {
    try {
      const parser = new UAParser(request.headers['user-agent']);
      const device = parser.getResult();

      // Generate or retrieve visitor ID
      const visitorId = this.getVisitorId(request);
      const sessionId = this.getSessionId(request);

      // Parse referrer and UTM parameters
      const referrer = request.headers.referer || request.headers.referrer;
      const utmParams = this.extractUtmParams(request.query);

      // Extract geographic data (would need a GeoIP service in production)
      const geoData = await this.getGeographicData(request.ip);

      // Create analytics record
      const analytics = await PageAnalytics.create({
        page_id: pageId,
        visitor_id: visitorId,
        user_id: options.userId || null,
        session_id: sessionId,
        ip_address: this.anonymizeIp(request.ip),
        user_agent: request.headers['user-agent'],
        browser: device.browser.name,
        browser_version: device.browser.version,
        device_type: this.getDeviceType(device),
        os: device.os.name,
        os_version: device.os.version,
        screen_resolution: options.screenResolution,
        referrer,
        utm_source: utmParams.utm_source,
        utm_medium: utmParams.utm_medium,
        utm_campaign: utmParams.utm_campaign,
        utm_term: utmParams.utm_term,
        utm_content: utmParams.utm_content,
        country: geoData.country,
        region: geoData.region,
        city: geoData.city,
        language: request.headers['accept-language']?.split(',')[0]
      });

      logger.info('Page view tracked', {
        analyticsId: analytics.id,
        pageId,
        visitorId
      });

      return analytics;
    } catch (error) {
      logger.error('Failed to track page view', { error: error.message, pageId });
      // Don't throw - analytics failures shouldn't break page serving
      return null;
    }
  }

  /**
   * Update page view with engagement data
   */
  async updateEngagement(analyticsId, data) {
    try {
      const analytics = await PageAnalytics.findByPk(analyticsId);

      if (!analytics) {
        throw new AppError('Analytics record not found', 404);
      }

      if (data.timeOnPage !== undefined) {
        analytics.time_on_page = data.timeOnPage;
      }

      if (data.scrollDepth !== undefined) {
        analytics.scroll_depth = data.scrollDepth;
      }

      if (data.bounce !== undefined) {
        analytics.bounce = data.bounce;
      }

      if (data.interactions) {
        analytics.interactions = {
          ...analytics.interactions,
          ...data.interactions
        };
      }

      if (data.exitPage) {
        analytics.exit_page = data.exitPage;
      }

      await analytics.save();

      logger.info('Engagement data updated', { analyticsId });

      return analytics;
    } catch (error) {
      logger.error('Failed to update engagement', { error: error.message, analyticsId });
      // Don't throw - analytics failures shouldn't break user experience
      return null;
    }
  }

  /**
   * Get page statistics
   */
  async getPageStats(pageId, startDate, endDate) {
    try {
      const stats = await PageAnalytics.getPageStats(pageId, startDate, endDate);

      // Calculate bounce rate
      const bounceRate = stats.total_views > 0
        ? (stats.bounce_count / stats.total_views) * 100
        : 0;

      return {
        ...stats,
        bounce_rate: bounceRate.toFixed(2)
      };
    } catch (error) {
      logger.error('Failed to get page stats', { error: error.message, pageId });
      throw error;
    }
  }

  /**
   * Get top referrers for a page
   */
  async getTopReferrers(pageId, limit = 10) {
    try {
      return await PageAnalytics.getTopReferrers(pageId, limit);
    } catch (error) {
      logger.error('Failed to get top referrers', { error: error.message, pageId });
      throw error;
    }
  }

  /**
   * Get geographic distribution
   */
  async getGeographicStats(pageId) {
    try {
      return await PageAnalytics.getGeographicStats(pageId);
    } catch (error) {
      logger.error('Failed to get geographic stats', { error: error.message, pageId });
      throw error;
    }
  }

  /**
   * Get device type distribution
   */
  async getDeviceStats(pageId, startDate, endDate) {
    try {
      const { sequelize } = require('../config/database');
      const where = { page_id: pageId };

      if (startDate) {
        where.created_at = { [require('sequelize').Op.gte]: startDate };
      }
      if (endDate) {
        where.created_at = { ...where.created_at, [require('sequelize').Op.lte]: endDate };
      }

      const stats = await PageAnalytics.findAll({
        where,
        attributes: [
          'device_type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('AVG', sequelize.col('time_on_page')), 'avg_time']
        ],
        group: ['device_type'],
        order: [[sequelize.literal('count'), 'DESC']],
        raw: true
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get device stats', { error: error.message, pageId });
      throw error;
    }
  }

  /**
   * Get browser distribution
   */
  async getBrowserStats(pageId, limit = 10) {
    try {
      const { sequelize } = require('../config/database');

      const stats = await PageAnalytics.findAll({
        where: { page_id: pageId },
        attributes: [
          'browser',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['browser'],
        order: [[sequelize.literal('count'), 'DESC']],
        limit,
        raw: true
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get browser stats', { error: error.message, pageId });
      throw error;
    }
  }

  /**
   * Get time-series data for page views
   */
  async getViewsTimeSeries(pageId, startDate, endDate, interval = 'day') {
    try {
      const { sequelize } = require('../config/database');

      let dateTrunc;
      switch (interval) {
        case 'hour':
          dateTrunc = 'hour';
          break;
        case 'day':
          dateTrunc = 'day';
          break;
        case 'week':
          dateTrunc = 'week';
          break;
        case 'month':
          dateTrunc = 'month';
          break;
        default:
          dateTrunc = 'day';
      }

      const where = { page_id: pageId };
      if (startDate) {
        where.created_at = { [require('sequelize').Op.gte]: startDate };
      }
      if (endDate) {
        where.created_at = { ...where.created_at, [require('sequelize').Op.lte]: endDate };
      }

      const stats = await PageAnalytics.findAll({
        where,
        attributes: [
          [sequelize.fn('DATE_TRUNC', dateTrunc, sequelize.col('created_at')), 'period'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'views'],
          [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('visitor_id'))), 'unique_visitors']
        ],
        group: [sequelize.fn('DATE_TRUNC', dateTrunc, sequelize.col('created_at'))],
        order: [[sequelize.fn('DATE_TRUNC', dateTrunc, sequelize.col('created_at')), 'ASC']],
        raw: true
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get views time series', { error: error.message, pageId });
      throw error;
    }
  }

  /**
   * Get UTM campaign performance
   */
  async getCampaignStats(pageId, startDate, endDate) {
    try {
      const { sequelize } = require('../config/database');
      const where = {
        page_id: pageId,
        utm_campaign: { [require('sequelize').Op.ne]: null }
      };

      if (startDate) {
        where.created_at = { [require('sequelize').Op.gte]: startDate };
      }
      if (endDate) {
        where.created_at = { ...where.created_at, [require('sequelize').Op.lte]: endDate };
      }

      const stats = await PageAnalytics.findAll({
        where,
        attributes: [
          'utm_source',
          'utm_medium',
          'utm_campaign',
          [sequelize.fn('COUNT', sequelize.col('id')), 'views'],
          [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('visitor_id'))), 'unique_visitors'],
          [sequelize.fn('AVG', sequelize.col('time_on_page')), 'avg_time']
        ],
        group: ['utm_source', 'utm_medium', 'utm_campaign'],
        order: [[sequelize.literal('views'), 'DESC']],
        raw: true
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get campaign stats', { error: error.message, pageId });
      throw error;
    }
  }

  /**
   * Generate visitor ID from request
   */
  getVisitorId(request) {
    // Try to get from cookie first
    if (request.cookies && request.cookies.visitor_id) {
      return request.cookies.visitor_id;
    }

    // Generate fingerprint from user agent + IP
    const data = `${request.headers['user-agent']}|${request.ip}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  /**
   * Generate session ID
   */
  getSessionId(request) {
    if (request.session && request.session.id) {
      return request.session.id;
    }

    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Anonymize IP address (GDPR compliance)
   */
  anonymizeIp(ip) {
    if (!ip) return null;

    // IPv4: mask last octet
    if (ip.includes('.')) {
      const parts = ip.split('.');
      parts[3] = '0';
      return parts.join('.');
    }

    // IPv6: mask last 80 bits
    if (ip.includes(':')) {
      const parts = ip.split(':');
      return parts.slice(0, 3).join(':') + '::';
    }

    return null;
  }

  /**
   * Extract UTM parameters
   */
  extractUtmParams(query) {
    return {
      utm_source: query.utm_source || null,
      utm_medium: query.utm_medium || null,
      utm_campaign: query.utm_campaign || null,
      utm_term: query.utm_term || null,
      utm_content: query.utm_content || null
    };
  }

  /**
   * Get device type from parser result
   */
  getDeviceType(device) {
    if (device.device.type === 'mobile') return 'mobile';
    if (device.device.type === 'tablet') return 'tablet';
    if (device.browser.name && device.browser.name.toLowerCase().includes('bot')) return 'bot';
    return 'desktop';
  }

  /**
   * Get geographic data from IP (mock implementation)
   * In production, integrate with MaxMind GeoIP or similar service
   */
  async getGeographicData(ip) {
    // This is a mock implementation
    // In production, use a GeoIP service like MaxMind
    return {
      country: null,
      region: null,
      city: null
    };
  }

  /**
   * Delete analytics data older than specified days
   */
  async cleanupOldData(olderThanDays = 365) {
    try {
      const { Op } = require('sequelize');
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await PageAnalytics.destroy({
        where: {
          created_at: {
            [Op.lt]: cutoffDate
          }
        }
      });

      logger.info('Cleaned up old analytics data', {
        deletedCount: result,
        olderThanDays
      });

      return { deletedCount: result };
    } catch (error) {
      logger.error('Failed to cleanup old analytics data', { error: error.message });
      throw error;
    }
  }
}

module.exports = new AnalyticsService();
