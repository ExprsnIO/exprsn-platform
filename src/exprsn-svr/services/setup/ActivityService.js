/**
 * ═══════════════════════════════════════════════════════════════════════
 * Activity Service
 * ═══════════════════════════════════════════════════════════════════════
 * Tracks and retrieves recent administrative activity
 * ═══════════════════════════════════════════════════════════════════════
 */

const logger = require('../../utils/logger');

class ActivityService {
  constructor() {
    // In-memory activity log (will be replaced with database table in Phase 2)
    this.activities = [];
    this.maxActivities = 1000;
  }

  /**
   * Log an activity
   */
  async logActivity(activity) {
    const record = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      userId: activity.userId || null,
      userName: activity.userName || 'System',
      action: activity.action,
      category: activity.category || 'general',
      details: activity.details || {},
      ipAddress: activity.ipAddress || null,
      userAgent: activity.userAgent || null
    };

    this.activities.unshift(record);

    // Keep only last N activities
    if (this.activities.length > this.maxActivities) {
      this.activities = this.activities.slice(0, this.maxActivities);
    }

    logger.info('Activity logged', {
      action: record.action,
      userId: record.userId
    });

    return record;
  }

  /**
   * Get recent activities
   */
  async getRecentActivity(options = {}) {
    const {
      limit = 20,
      offset = 0,
      category = null,
      userId = null
    } = options;

    let filtered = [...this.activities];

    // Filter by category
    if (category) {
      filtered = filtered.filter(a => a.category === category);
    }

    // Filter by user
    if (userId) {
      filtered = filtered.filter(a => a.userId === userId);
    }

    // Apply pagination
    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit);

    return {
      items,
      total,
      limit,
      offset,
      hasMore: (offset + limit) < total
    };
  }

  /**
   * Get activity by ID
   */
  async getActivity(id) {
    return this.activities.find(a => a.id === id) || null;
  }

  /**
   * Clear all activities
   */
  async clearActivities() {
    this.activities = [];
    logger.info('All activities cleared');
  }

  /**
   * Get activity statistics
   */
  async getActivityStats(period = '24h') {
    const now = new Date();
    let cutoff;

    switch (period) {
      case '1h':
        cutoff = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const recentActivities = this.activities.filter(a => {
      return new Date(a.timestamp) >= cutoff;
    });

    // Group by category
    const byCategory = {};
    const byUser = {};

    for (const activity of recentActivities) {
      // Count by category
      if (!byCategory[activity.category]) {
        byCategory[activity.category] = 0;
      }
      byCategory[activity.category]++;

      // Count by user
      if (activity.userId) {
        if (!byUser[activity.userId]) {
          byUser[activity.userId] = {
            userId: activity.userId,
            userName: activity.userName,
            count: 0
          };
        }
        byUser[activity.userId].count++;
      }
    }

    return {
      period,
      total: recentActivities.length,
      byCategory,
      topUsers: Object.values(byUser).sort((a, b) => b.count - a.count).slice(0, 10)
    };
  }
}

module.exports = new ActivityService();
