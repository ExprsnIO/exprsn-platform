/**
 * Metrics and Analytics Routes
 * Provides aggregated metrics for the moderation dashboard
 */

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize } = require('../models');
const ModerationCase = require('../models/ModerationCase');
const ModerationAction = require('../models/ModerationAction');
const Report = require('../models/Report');
const ReviewQueue = require('../models/ReviewQueue');
const Appeal = require('../models/Appeal');
const logger = require('../utils/logger');

/**
 * GET /api/metrics
 * Get aggregated metrics for specified time period
 * Query params: period (today, week, month, all)
 */
router.get('/', async (req, res) => {
  try {
    const { period = 'today' } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate;

    switch (period) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case 'all':
        startDate = new Date(0); // Beginning of time
        break;
      default:
        startDate = new Date(now.setHours(0, 0, 0, 0));
    }

    // Get pending count
    const pending = await ReviewQueue.count({
      where: { status: 'pending' }
    });

    // Get reviewed count for period
    const reviewed = await ModerationCase.count({
      where: {
        status: { [Op.in]: ['approved', 'rejected', 'flagged'] },
        updatedAt: { [Op.gte]: startDate }
      }
    });

    // Get actions count for period
    const actions = await ModerationAction.count({
      where: {
        createdAt: { [Op.gte]: startDate }
      }
    });

    // Calculate average response time (in minutes)
    const responseTimes = await ModerationCase.findAll({
      where: {
        status: { [Op.in]: ['approved', 'rejected', 'flagged'] },
        updatedAt: { [Op.gte]: startDate }
      },
      attributes: [
        [sequelize.fn('AVG',
          sequelize.literal('EXTRACT(EPOCH FROM (updated_at - created_at)) / 60')
        ), 'avg_minutes']
      ],
      raw: true
    });

    const responseTime = Math.round(responseTimes[0]?.avg_minutes || 0);

    // Get previous period data for change calculation
    let previousStartDate;
    if (period === 'today') {
      previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - 1);
    } else if (period === 'week') {
      previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - 7);
    } else if (period === 'month') {
      previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - 30);
    }

    let reviewedChange = 0;
    if (previousStartDate) {
      const previousReviewed = await ModerationCase.count({
        where: {
          status: { [Op.in]: ['approved', 'rejected', 'flagged'] },
          updatedAt: {
            [Op.gte]: previousStartDate,
            [Op.lt]: startDate
          }
        }
      });

      if (previousReviewed > 0) {
        reviewedChange = Math.round(((reviewed - previousReviewed) / previousReviewed) * 100);
      } else if (reviewed > 0) {
        reviewedChange = 100;
      }
    }

    // Get hourly activity for charts (last 24 hours for today, daily for week/month)
    let activityData;
    if (period === 'today') {
      // Get hourly data
      activityData = await ModerationAction.findAll({
        where: {
          createdAt: { [Op.gte]: startDate }
        },
        attributes: [
          [sequelize.fn('DATE_TRUNC', 'hour', sequelize.col('created_at')), 'hour'],
          [sequelize.fn('COUNT', '*'), 'count']
        ],
        group: [sequelize.fn('DATE_TRUNC', 'hour', sequelize.col('created_at'))],
        order: [[sequelize.fn('DATE_TRUNC', 'hour', sequelize.col('created_at')), 'ASC']],
        raw: true
      });
    } else {
      // Get daily data
      activityData = await ModerationAction.findAll({
        where: {
          createdAt: { [Op.gte]: startDate }
        },
        attributes: [
          [sequelize.fn('DATE_TRUNC', 'day', sequelize.col('created_at')), 'day'],
          [sequelize.fn('COUNT', '*'), 'count']
        ],
        group: [sequelize.fn('DATE_TRUNC', 'day', sequelize.col('created_at'))],
        order: [[sequelize.fn('DATE_TRUNC', 'day', sequelize.col('created_at')), 'ASC']],
        raw: true
      });
    }

    // Get action type distribution
    const actionTypes = await ModerationAction.findAll({
      where: {
        createdAt: { [Op.gte]: startDate }
      },
      attributes: [
        'action_type',
        [sequelize.fn('COUNT', '*'), 'count']
      ],
      group: ['action_type'],
      raw: true
    });

    // Get queue count
    const queueCount = await ReviewQueue.count({
      where: { status: 'pending' }
    });

    // Get reports count
    const reportsCount = await Report.count({
      where: {
        status: { [Op.in]: ['pending', 'under_review'] },
        createdAt: { [Op.gte]: startDate }
      }
    });

    // Get appeals count
    const appealsCount = await Appeal.count({
      where: {
        status: 'pending',
        createdAt: { [Op.gte]: startDate }
      }
    });

    res.json({
      success: true,
      period,
      metrics: {
        pending,
        reviewed,
        actions,
        responseTime,
        reviewedChange,
        queueCount,
        reportsCount,
        appealsCount
      },
      activity: activityData.map(row => ({
        time: row.hour || row.day,
        count: parseInt(row.count)
      })),
      actionTypes: actionTypes.reduce((acc, row) => {
        acc[row.action_type] = parseInt(row.count);
        return acc;
      }, {})
    });
  } catch (error) {
    logger.error('Error fetching metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/metrics/export
 * Export metrics as CSV
 * Query params: period (today, week, month, all)
 */
router.get('/export', async (req, res) => {
  try {
    const { period = 'today' } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate;

    switch (period) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case 'all':
        startDate = new Date(0);
        break;
      default:
        startDate = new Date(now.setHours(0, 0, 0, 0));
    }

    // Get all actions for the period
    const actions = await ModerationAction.findAll({
      where: {
        createdAt: { [Op.gte]: startDate }
      },
      attributes: [
        'id', 'action_type', 'content_type', 'content_id',
        'reason', 'moderator_id', 'created_at'
      ],
      order: [['created_at', 'DESC']],
      raw: true
    });

    // Generate CSV
    const headers = ['ID', 'Action Type', 'Content Type', 'Content ID', 'Reason', 'Moderator ID', 'Date'];
    const rows = actions.map(action => [
      action.id,
      action.action_type,
      action.content_type,
      action.content_id,
      action.reason || '',
      action.moderator_id || 'system',
      new Date(action.created_at).toISOString()
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="moderation-report-${period}-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error('Error exporting metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export metrics',
      message: error.message
    });
  }
});

module.exports = router;
